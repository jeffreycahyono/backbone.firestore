import Bb from 'backbone';
import {
  omit
} from 'underscore';

let chai = require('chai');
let sinonChai = require('sinon-chai');
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.use(sinonChai);
let expect = chai.expect;

import {
  spy,
  stub
} from 'sinon';

import * as firebase from 'firebase';
import 'firebase/firestore';
import './initFirebase';


import {
  unsubscribeUpdate,
  FirestoreAdapter,
  deleteCollection,
  getModelDocRef
} from 'backbone.firestore';

const attributes = {
  string: 'String',
  string2: 'String 2',
  number: 1337
};

const collectionAdapterName = 'BackboneFirestoreCollectionTest';
const savedModelAdapterName = 'BackboneFirestoreModelTest';
const SavedModel = Bb.Model.extend({
  firestore: new FirestoreAdapter(savedModelAdapterName),
  defaults: attributes,
  urlRoot: '/test/'
});

function check(done, f) {
  try {
    f();
    done();
  } catch (e) {
    done(e);
  }
}


describe('FirestoreAdapter Collection', function() {
  this.timeout(60000);
  const saints = [
    { name: 'Augustine of Hippo', category: 'Church Fathers', feast: new Date('28 August 430'), age: 75 },
    { name: 'Clement of Rome', category: 'Church Fathers', feast: new Date('23 Feb 156'), age: 66 },
    { name: 'Ambrose', category: 'Church Fathers', feast: new Date('7 Dec 397'), age: 56 },
    { name: 'Thérèse of Lisieux', category: 'Doctors', feast: new Date('2 Oct 1897'), age: 24 },
    { name: 'Thomas Aquinas', category: 'Doctors', feast: new Date('28 Jan 1274'), age: 49 },
    { name: 'Albertus Magnus', category: 'Doctors', feast: new Date('15 Nov 1280'), age: 80 },
    { name: 'Clare of Assisi', category: 'Virgins', feast: new Date('11 Aug 1253'), age: 59 },
    { name: 'Mother Teresa', category: 'Virgins', feast: new Date('5 Sept 1997'), age: 87 },
    { name: 'Rose of Lima', category: 'Virgins', feast: new Date('23 Aug 1617'), age: 31 }
  ];
  const Collection = Bb.Collection.extend({
    firestore: new FirestoreAdapter(collectionAdapterName)
  });
  const Model = Bb.Model.extend({
    firestore: new FirestoreAdapter(collectionAdapterName)
  });
  beforeEach(async function() {
    let collectionA = new Collection();
    await deleteCollection(collectionA);
  });

  it('can unsubscribe from realtime update', async function() {
    let collectionA = new Collection(),
      options = {
        subscriptionEnabled: true,
        firestoreQuery: colRef => colRef.orderBy('age')
      };
    await collectionA.fetch(options);
    let modelA = new Model(),
      savedPromises = saints.map(rec => modelA.save(rec));
    await Promise.all(savedPromises);
    await new Promise((resolve, reject)=>{
      let intervalId = setInterval(() => {
        if (collectionA.length !== saints.length) {
          return;
        }
        clearInterval(intervalId);
        resolve();
      } , 100);
    });
    let lengthBeforeUnsubscribe = collectionA.length;
    unsubscribeUpdate(collectionA);
    let modelB = new Model(), modelC = new Model();
    await modelB.save({ name: 'Francis de Sales', age: 52 });
    await modelC.save({ name: 'Ignatius Loyola', age: 53 });
    expect(collectionA.length).to.equal(lengthBeforeUnsubscribe);
  });
  it('listen to realtime collection update', async function() {
    let collectionA = new Collection(),
      onSync = spy(),
      onFirestoreUpdate = spy(),
      options = {
        subscriptionEnabled: true,
        firestoreQuery: colRef => colRef.orderBy('age')
      };
    await collectionA.fetch(options);
    collectionA.on('sync', onSync);
    collectionA.on('firestore:snapshot:collection', onFirestoreUpdate);
    let modelA = new Model(), savedPromises = [];
    saints.forEach(rec => {
      savedPromises.push(modelA.save(rec));
    });
    await Promise.all(savedPromises);
    await new Promise((resolve, reject)=>{
      let intervalId = setInterval(() => {
        if (collectionA.length !== saints.length) {
          return;
        }
        clearInterval(intervalId);
        let sortedCollection = new Bb.Collection(saints, { comparator: 'age' }),
          result = collectionA.toJSON().map(rec => omit(rec, 'id'));
        expect(result).to.eql(sortedCollection.toJSON());
        expect(onSync.callCount).to.equal(9);
        expect(onFirestoreUpdate.callCount).to.equal(9);
        resolve();
      } , 100);
    });
  });
  it('throws or rejects if fetch fails', function() {
    let alist = new Collection(),
      options = {
        firestoreQuery: colRef => colRef
          .where('category', '==', 'Church Fathers')
          .where('age', '<=', 50)
      };
    return expect(alist.fetch(options)).be.rejectedWith('The query requires an index');
  });
  it('destroys models and removes from collection', async function() {
    let modalA = new Model();
    await modalA.save(saints[0]);
    let alist = new Collection();
    await alist.fetch();
    expect(alist).to.have.length(1);
    let firstModel = alist.at(0), id = firstModel.id;
    expect(firstModel.get('name')).to.equal(saints[0].name);
    await firstModel.destroy();
    let removedModel = new Model({ id }),
      resp = await removedModel.fetch();
    expect(resp).to.be.false;
    expect(alist).to.have.length(0);
  });
  it('can fetch with queries', async function() {
    let modalA = new Model(),
      savedPromises = saints.map(rec => modalA.save(rec));
    await Promise.all(savedPromises);

    let alist = new Collection(),
      options = {};
    options.firestoreQuery = colRef => colRef.where('age', '<=', 50).orderBy('age');
    await alist.fetch(options);
    expect(alist.map('name')).to.eql(['Thérèse of Lisieux', 'Rose of Lima', 'Thomas Aquinas']);
  });
});

describe('FirestoreAdapter Model', function() {
  let mySavedModel;

  beforeEach(async function() {
    this.timeout(60000);
    mySavedModel = new SavedModel({});
    await deleteCollection(mySavedModel);
  });

  afterEach(function() {
    mySavedModel = null;
  });

  it('can insert timestamp field in the model', async function() {
    await mySavedModel.save({ 'timestamp': firebase.firestore.FieldValue.serverTimestamp() });
    let now = new Date();
    await mySavedModel.fetch();
    let attr = mySavedModel.toJSON();
    expect(attr.timestamp.getTime()).to.be.closeTo(now.getTime(), 10000);
  });
  it('can destroy model', async function() {
    //create new model and save to firestore
    let resp = await mySavedModel.save(),
      id = resp.id,
      attr = mySavedModel.toJSON();
    mySavedModel.clear();
    expect(mySavedModel.toJSON()).to.eql({});

    //fetch to make sure it exists in firestore
    mySavedModel.set('id', id);
    resp = await mySavedModel.fetch();
    expect(resp).to.eql(attr);

    //delete the model from firestore
    let cb = spy();
    mySavedModel.on('destroy', cb);
    mySavedModel.set('id', id);
    resp = await mySavedModel.destroy();
    expect(resp).to.be.undefined;
    expect(cb).to.have.been.calledOnce;
    expect(cb).to.have.been.calledWith(mySavedModel, undefined);

    //try to fetch the deleted model, and should resolved to false
    mySavedModel.clear();
    mySavedModel.set('id', id);
    resp = await mySavedModel.fetch();
    expect(resp).to.be.false;
  });
  it('should resolved to false and not change the model attributes when fetching non existing model in firestore', async function() {
    //fetch without subscription
    let modelA = new SavedModel({ id: 'notExistingIds0001' }),
      originalAttrA = modelA.toJSON(),
      respA = await modelA.fetch();
    expect(modelA.toJSON()).to.eql(originalAttrA);
    expect(respA).to.be.false;

    //fetch with subscription to realtime update
    let modelB = new SavedModel({ id: 'notExistingIds0002' }),
      originalAttrB = modelB.toJSON(),
      cb = spy();
    modelB.on('firestore:snapshot:model', cb);
    let respB = null;
    respB = await modelB.fetch({ subscriptionEnabled: true });
    expect(modelB.toJSON()).to.eql(originalAttrB);
    expect(respB).to.be.false;
    expect(cb).to.have.been.calledOnce;
    expect(cb.firstCall.args.length).to.equal(2);
    expect(cb.firstCall.args[0]).to.eql(modelB);
    const docB = cb.firstCall.args[1];
    expect(docB.exists).to.be.false;
    expect(docB.id).to.equal(modelB.id);
  });
  it('is saved with success callback', function(done) {
    let checkSavedData = (model, resp, options) => {
      let docRef = getModelDocRef(model);
      docRef.get().then((doc)=>{
        check(done, ()=>{
          let modelAttr = omit(model.toJSON(), 'id');
          expect(resp).to.eql({ id: doc.id });
          expect(model.id).to.eql(resp.id);
          expect(doc.data()).to.eql(modelAttr);
        });
      });
    };
    let options = {
      success: checkSavedData
    };
    mySavedModel.save(null,options);
  });
  it('is saved with resolved promise', async function() {
    let resp = await mySavedModel.save();
    let docRef = getModelDocRef(mySavedModel);
    let data = await docRef.get().then(doc=>doc.data());
    expect(resp.id).to.eql(mySavedModel.id);
    expect(data).to.eql(omit(mySavedModel.toJSON(), 'id'));
  });
  it('can save with predefined id and then can be fetched and updated', async function() {
    mySavedModel.isNew = () => true;
    mySavedModel.set('id', '12345');
    let resp = await mySavedModel.save();
    expect(resp.id).to.eql('12345');
    let NewModel = Bb.Model.extend({
      firestore: new FirestoreAdapter(savedModelAdapterName)
    });

    //fetch with a different model instance
    let model = new NewModel({ id: '12345' }),
      respModel = await model.fetch();
    expect(respModel).to.eql(mySavedModel.toJSON());
    expect(model.toJSON()).to.eql(mySavedModel.toJSON());

    //update test
    let newNumber = 25120000;
    await mySavedModel.save({ number: newNumber });
    respModel = await model.fetch();
    expect(respModel.number).to.eql(newNumber);
    expect(model.get('number')).to.eql(newNumber);
  });
  it('can sync local changes to realtime update', async function() {
    //save with id 001
    mySavedModel.isNew = () => true;
    mySavedModel.set('id', '001');
    let resp = await mySavedModel.save(),
      id = resp.id;

    //create listener model with  id 001 and fetch
    let NewModel = Bb.Model.extend({
      firestore: new FirestoreAdapter(savedModelAdapterName)
    });
    let newNumber = 251200,
      listener = new NewModel({ id }),
      respListener = await listener.fetch({
        subscriptionEnabled: true,
      });
    expect(respListener).to.eql(mySavedModel.toJSON());
    let resolved = new Promise((resolve) => {
      listener.on('sync', () => {
        expect(listener.get('number')).to.eql(newNumber);
        resolve();
      });
    });

    //update model with id 001 to newNumber
    let updatedResp = await mySavedModel.save({ number: newNumber });
    expect(updatedResp.id).to.equal(listener.id);

    //expect listener also change its attribute
    await resolved;
  }).timeout(60000);

  describe('using ajaxSync: true', function() {
    beforeEach(function() {
      mySavedModel.set('id', 10);
      stub(Bb, 'ajax');
    });

    afterEach(function() {
      Bb.ajax.restore();
    });

    it('calls $.ajax for fetch', function() {
      mySavedModel.fetch({
        ajaxSync: true
      });

      expect(Bb.ajax.called).to.equal(true);
      expect(Bb.ajax.getCall(0).args[0].url).to.equal('/test/10');
      expect(Bb.ajax.getCall(0).args[0].type).to.equal('GET');
    });

    it('calls $.ajax for save', function() {
      mySavedModel.save({}, {
        ajaxSync: true
      });

      expect(Bb.ajax.called).to.equal(true);
      expect(Bb.ajax.getCall(0).args[0].type).to.equal('PUT');
      expect(Bb.ajax.getCall(0).args[0].url).to.equal('/test/10');

      const data = JSON.parse(Bb.ajax.getCall(0).args[0].data);

      expect(data).to.eql({
        string: 'String',
        string2: 'String 2',
        number: 1337,
        id: 10
      });
    });
  });
});

/*
describe('Model with different idAttribute', function() {
  let mySavedModel;

  beforeEach(function() {
    mySavedModel = new DifferentIdAttribute(attributes);
  });

  afterEach(function() {
    mySavedModel = null;
    root.localStorage.clear();
  });

  it('saves using the new value', function() {
    mySavedModel.save();
    const item = root.localStorage.getItem('DifferentId-1337');
    const parsed = JSON.parse(item);

    expect(item).to.not.be(null);
    expect(parsed.string).to.be('String');
  });

  it('fetches using the new value', function() {
    root.localStorage.setItem('DifferentId-1337', JSON.stringify(attributes));
    const newModel = new DifferentIdAttribute({
      number: 1337
    });

    newModel.fetch();

    expect(newModel.id).to.be(1337);
    expect(newModel.get('string')).to.be('String');
  });
});


describe('New localStorage model', function() {
  let mySavedModel;

  beforeEach(function() {
    mySavedModel = new SavedModel();
  });

  afterEach(function() {
    root.localStorage.clear();
    mySavedModel = null;
  });

  it('creates a new item in localStorage', function() {
    mySavedModel.save({
      data: 'value'
    });

    const itemId = mySavedModel.id;
    const item = root.localStorage.getItem(`SavedModel-${itemId}`);

    const parsed = JSON.parse(item);

    expect(parsed).to.eql(mySavedModel.attributes);
  });
});


describe('FirestoreAdapter Collection', function() {
  let mySavedCollection;

  beforeEach(function() {
    mySavedCollection = new SavedCollection();
  });

  afterEach(function() {
    mySavedCollection = null;
    root.localStorage.clear();
  });

  it('saves to localStorage', function() {
    mySavedCollection.create(attributes);
    expect(mySavedCollection.length).to.be(1);
  });

  it('cannot duplicate id in localStorage', function() {
    const item = clone(attributes);
    item.id = 5;

    const newCollection = new SavedCollection([item]);
    newCollection.create(item);
    newCollection.create(item);
    const localItem = root.localStorage.getItem('SavedCollection-5');

    expect(newCollection.length).to.be(1);
    expect(JSON.parse(localItem).id).to.be(5);

    const records = newCollection.localStorage.records;
    expect(uniq(records)).to.eql(records);
  });


  describe('pulling from localStorage', function() {
    let model;
    let item;

    beforeEach(function() {
      model = mySavedCollection.create(attributes);
      const id = model.id;
      item = root.localStorage.getItem(`SavedCollection-${id}`);
    });

    afterEach(function() {
      model = item = null;
    });

    it('saves into the localStorage', function() {
      expect(item).to.not.be(null);
    });

    it('saves the right data', function() {
      const parsed = JSON.parse(item);
      expect(parsed.id).to.equal(model.id);
      expect(parsed.string).to.be('String');
    });

    it('reads from localStorage', function() {
      const newCollection = new SavedCollection();
      newCollection.fetch();

      expect(newCollection.length).to.be(1);
      const newModel = newCollection.at(0);
      expect(newModel.get('string')).to.be('String');
    });

    it('destroys models and removes from collection', function() {
      const parsed = JSON.parse(item);
      const newModel = mySavedCollection.get(parsed.id);
      newModel.destroy();

      const removed = root.localStorage.getItem(`SavedCollection-${parsed.id}`);

      expect(removed).to.be(null);
      expect(mySavedCollection.length).to.be(0);
    });
  });

  describe('will fetch from localStorage if updated separately', function() {
    let newCollection = null;

    beforeEach(function() {
      mySavedCollection.create(attributes);
      newCollection = new SavedCollection();
      newCollection.fetch();
    });

    afterEach(function() {
      newCollection = null;
    });

    it('fetches the items from the original collection', function() {
      expect(newCollection.length).to.equal(1);
    });

    it('will update future changes', function() {
      const newAttributes = clone(attributes);
      newAttributes.number = 1338;
      mySavedCollection.create(newAttributes);
      newCollection.fetch();
      expect(newCollection.length).to.equal(2);
    });
  });
});
*/
