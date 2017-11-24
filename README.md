# Backbone Firebase FireStore Backend

[![Build Status](https://api.travis-ci.org/jeffreycahyono/backbone.firestore.svg?branch=master)](https://travis-ci.org/jeffreycahyono/backbone.firestore)

An adapter that replaces `Backbone.sync` to save to `Firebase Firestore` instead of using ajax.

## Usage

Import `backbone.firestore` and attach it to your models and collections:

```javascript
const firebase = require("firebase");
require("firebase/firestore");
import {Collection, Model} from 'backbone';
import {FirestoreAdapter} from 'backbone.firestore';

firebase.initializeApp({
  apiKey: '### FIREBASE API KEY ###',
  authDomain: '### FIREBASE AUTH DOMAIN ###',
  projectId: '### CLOUD FIRESTORE PROJECT ID ###'
});

const SomeCollection = Collection.extend({

  /**
   * This collection will linked to Firestore collection which its name is
   * 'SomeCollection' => firebase.firestore().collection(SomeCollection)
   */
  firestore: new FirestoreAdapter('SomeCollection'), 

});

const SomeModel = Model.extend({

  /**
   * A model can also has firestore property linked to 
   * Firestore collection  'SomeCollection'
   */
  firestore: new FirestoreAdapter('SomeCollection')

});
```

To enable realtime update for subsequent changes, use  `subscriptionEnabled: true` in the fetch options

```javascript
const myModel = new SomeModel({id: 1234});
//any changes in firestore doc of id 1234 will also synced to myModel
myModel.fetch({subscriptionEnabled: true});  

const myCol = new SomeCollection();
//any changes in firestore collection will also synced to myCol
myCol.fetch({subscriptionEnabled: true});  
```

To perform firestore query

```javascript
const myCol = new SomeCollection();
let options = {
  //use firestoreQuery callback which its argument is CollectionReference and
  //return the query
  firestoreQuery = colRef => colRef.where('age', '<=', 50).orderBy('age')  
}
myCol.fetch(options);  
```

To synchronise with the server, you can pass the `ajaxSync` flag to any options:

```javascript
const myModel = new SomeModel();
myModel.fetch({
  ajaxSync: true  // Fetches from the server
});

myModel.save({
  new: "value"
}, {
  ajaxSync: true  // Pushes back to the server
});
```

### JavaScript ES5

```javascript
var bbFirestore = require('backbone.firestore');
var FirestoreAdapter = bbFirestore.FirestoreAdapter;
```

### JavaScript ES6+

```javascript
import {FirestoreAdapter} from 'backbone.firestore';
```

## Contributing

Install NodeJS and run `yarn` or `npm i` to get your dependencies, then:

1. Open an issue identifying the fault
2. Provide a fix, with tests demonstrating the issue
3. Create `.env` in root project directory to provide the firebase firestore credential with fields. There is an example in `.env.example`
4. Run `npm test`
5. Create a pull request


## Acknowledgments

- [Jerome Gravel-Niquet](https://github.com/jeromegn): This code is basically a port of his awesome Backbone.localStorage library
