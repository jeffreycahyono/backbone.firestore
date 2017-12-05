import Backbone from 'backbone';
import * as firebase from 'firebase';

import { extend, omit } from 'underscore';

import { getFirestore } from './utils';

let docToJSON = (docRef) => {
  return docRef && extend({ id: docRef.id }, docRef.data()) || {};
};

let querySnapshotToArray = (querySnapshot) => {
  let resp = [];
  querySnapshot.forEach(function(doc) {
    resp.push(docToJSON(doc));
  });
  return resp;
};


let getModelDocRef = (model) => {
  let adapter = getFirestore(model);
  if (!model.id) {
    throw 'model.id is needed to get model\'s docRef ';
  }
  return adapter._collectionRef.doc(model.id);
};

function getFirestoreProp(modelOrCollection, property) {
  return modelOrCollection._firestoreData && modelOrCollection._firestoreData[property];
}

function setFirestoreProp(modelOrCollection, property, value) {
  modelOrCollection._firestoreData = modelOrCollection._firestoreData || {};
  modelOrCollection._firestoreData[property] = value;
}

function isSubscribed(modelOrCollection) {
  return getFirestoreProp('unsubscribe') || false;
}

let unsubscribeUpdate = function(modelOrCollection) {
  let unsubscribe = getFirestoreProp(modelOrCollection, 'unsubscribe');
  if (unsubscribe) {
    unsubscribe();
    setFirestoreProp(modelOrCollection, 'unsubscribe', null);
  }
};

/**
 * Enable Realtime Update for Backbone.Model
 *
 * @param {Backbone.Model} model the model to listen, model.id must be specified
 * @param {object} [options] A map of options
 * @param {boolean} [options.parse] default to true, set false to not call
 *   model.parse on update
 * @returns {Promise} Promise that resolved to firebase.firestore.DocumentReference,
 *    retrieve the data using doc.data() method
 */
let subscribeModelUpdate = function(model, options = {}) {
  return new Promise((resolve, reject) => {
    options = extend({ parse: true }, options);
    if (isSubscribed(model)) {
      resolve(false);
      return;
    }
    let docRef = getModelDocRef(model);
    let handleSnapshot = (doc) => {
      model.trigger('firestore:snapshot:model', model, doc);
      if (!options.skipFirstUpdate) {
        if (doc.exists) {
          let resp = docToJSON(doc);
          let serverAttrs = options.parse ? model.parse(resp, options) : resp;
          if (!model.set(serverAttrs, options)) {
            reject('backbone.firestore realtime model update fails to set model');
          }
          model.trigger('sync', model, resp, options);
        }
      }
      delete options.skipFirstUpdate;
      resolve(doc);
    };
    let handleError = error => {
      model.trigger('error', model, error, options);
      reject(error);
    };
    let unsubscribe = docRef.onSnapshot(handleSnapshot, handleError);
    setFirestoreProp(model, 'unsubscribe', unsubscribe);
    model.once('destroy remove change:id', () => {
      unsubscribeUpdate(model);
    });
  });
};

/**
 * Enable Realtime Update for Backbone.Collection
 *
 * @param {Backbone.Collection} collection The collection to watch
 * @param {object|null} [options] The options
 * @param {boolean} [options.reset] set to true to reset collection on update
 * @returns {void}
 */
let subscribeCollectionUpdate = function(collection, options) {
  return new Promise((resolve, reject) => {
    if (isSubscribed(collection)) {
      unsubscribeUpdate(collection);
    }
    let adapter = collection.firestore;
    let query = adapter.getQuery(options);
    let handleSnapshot = function(querySnapshot) {
      collection.trigger('firestore:snapshot:collection', collection, querySnapshot);
      if (!options.skipFirstUpdate) {
        let resp = querySnapshotToArray(querySnapshot),
          method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        collection.trigger('sync', collection, resp, options);
      }
      delete options.skipFirstUpdate;
      resolve(querySnapshot);
    };
    let handleError = error => {
      collection.trigger('error', collection, error, options);
      reject(error);
    };
    let unsubscribe = query.onSnapshot(handleSnapshot, handleError);
    setFirestoreProp(collection, 'unsubscribe', unsubscribe);
  });
};

/**
 * Delete a collection, in batches of batchSize. Note that this does
 * not recursively delete subcollections of documents in the collection
 * https://firebase.google.com/docs/firestore/manage-data/delete-data
 *
 * @param {Backbone.Collection} collection A collection to be deleted that has a firestore adapter
 * @param {int} batchSize number of record per batch
 * @return {Promise} a promise
 */
function deleteCollection(collection, batchSize = 16) {
  let collectionRef = getFirestore(collection).getCollectionRef();
  let query = collectionRef.orderBy('__name__').limit(batchSize),
    db = firebase.firestore();

  return new Promise(function(resolve, reject) {
    deleteQueryBatch(db, query, batchSize, resolve, reject);
  });
}

function deleteQueryBatch(db, query, batchSize, resolve, reject) {
  query.get()
    .then((snapshot) => {
      // When there are no documents left, we are done
      if (snapshot.size === 0) {
        return 0;
      }

      // Delete documents in a batch
      let batch = db.batch();
      snapshot.docs.forEach(function(doc) {
        batch.delete(doc.ref);
      });

      return batch.commit().then(function() {
        return snapshot.size;
      });
    }).then(function(numDeleted) {
      if (numDeleted <= batchSize) {
        resolve();
        return;
      }

      // Recurse on the next process tick, to avoid
      // exploding the stack.
      setTimeout(() => {deleteQueryBatch(db, query, batchSize, resolve, reject);}, 0);
    })
    .catch(reject);
}


/**
 * Firestore Adapter for Backbone Model or Collection.
 * Usage:
 *   export const MyModel = Backbone.Model.extend({
 *     firestore: new FirestorAdapter('MyModelName')
 *   });
 */
class FirestoreAdapter {
  /**
   * @constructs FirestoreAdapter
   * @param {string} collectionName firestore's collection name
   */
  constructor(collectionName) {
    if (!collectionName) {
      throw 'Backbone.firestore: collectionName must be defined in constructor.';
    }
    this._collectionRef = firebase.firestore().collection(collectionName);
    extend(this, Backbone.Events);
  }

  getCollectionRef() {
    return this._collectionRef;
  }

  save(model, firestoreOptions = {}) {
    let docRef = (!model.id && model.id !== 0) ? this.getCollectionRef().doc() : this.getCollectionRef().doc(model.id),
      data = omit(model.toJSON(), 'id');
    return docRef.set(data, firestoreOptions)
      .then(() => {
        return {
          id: docRef.id
        };
      });
  }

  /** Add a new model with a unique GUID, if it doesn't already have its own ID
   * @param {Model} model - The Backbone Model to save to LocalStorage
   * @returns {Model} The saved model
   */
  create(model) {
    return this.save(model);
  }

  /** Update an existing model in LocalStorage
   * @param {Model} model - The model to update
   * @returns {Model} The updated model
   */
  update(model) {
    return this.save(model, { merge: true });
  }

  /** Retrieve a model from firestore by model id
   *
   * @param {Model} model - The Backbone Model to lookup
   * @param {object|null} [options] The options
   * @param {boolean} [options.subscriptionEnabled] set true to enable realtime update
   * @returns {object|false} model attributes  or false if not found
   */
  find(model, options = {}) {
    let promise;
    if (options.subscriptionEnabled && !isSubscribed(model)) {
      promise = subscribeModelUpdate(
        model,
        extend({ skipFirstUpdate: true }, options)
      );
    } else {
      let docRef = this.getCollectionRef().doc(model.id);
      promise = docRef.get();
    }
    return promise.then(doc => doc.exists ? docToJSON(doc) : false);
  }

  getQuery(options) {
    let queryFn = options.firestoreQuery;
    return queryFn ? queryFn(this.getCollectionRef()) : this.getCollectionRef();
  }

  /** Retrieve a collection from firestore
   *
   * @param {Collection} collection The Backbone collection instance
   * @param {object|null} [options] The options
   * @param {boolean} [options.subscriptionEnabled] set true to enable realtime update
   * @param {function(firestore.CollectionReference):firestore.Query} [options.firestoreQuery] a function
   *  to set firestore queries
   * @returns {array} Array of object atrributes
   */
  findAll(collection, options = {}) {
    let promise;
    if (options.subscriptionEnabled) {
      promise = subscribeCollectionUpdate(
        collection,
        extend({ skipFirstUpdate: true }, options)
      );
    } else {
      promise = this.getQuery(options).get();
    }
    return promise.then(querySnapshot => querySnapshotToArray(querySnapshot));
  }

  /** Delete a model from `this.data`, returning it.
   * @param {Model} model - Model to delete
   * @returns {Model} Model removed from this.data
  */
  destroy(model) {
    let docRef = this.getCollectionRef().doc(model.id);
    return docRef.delete();
  }
};

export {
  unsubscribeUpdate,
  querySnapshotToArray,
  getModelDocRef,
  deleteCollection,
  FirestoreAdapter
};
