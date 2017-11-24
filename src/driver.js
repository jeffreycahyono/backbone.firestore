import Backbone from 'backbone';

import {
  unsubscribeUpdate,
  getModelDocRef,
  deleteCollection,
  FirestoreAdapter
} from './FirestoreAdapter';
import { sync as firestoreSync } from './sync';
import { getFirestore } from './utils';

Backbone.FirestoreAdapter = FirestoreAdapter;
const ajaxSync = Backbone.sync;

/** Get the local or ajax sync call
 * @param {Model} model - Model to sync
 * @param {object} options - Options to pass, takes ajaxSync
 * @returns {function} The sync method that will be called
 */
function getSyncMethod(model, options = {}) {
  const forceAjaxSync = options.ajaxSync;
  const hasFirestore = getFirestore(model);

  return !forceAjaxSync && hasFirestore ? firestoreSync : ajaxSync;
}


Backbone.sync = function(method, model, options) {
  return getSyncMethod(model, options).apply(this, [method, model, options]);
};

export {
  unsubscribeUpdate,
  getModelDocRef,
  deleteCollection,
  FirestoreAdapter,
};
