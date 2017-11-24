import { getFirestore } from './utils';

import { isUndefined } from 'underscore';

/** Override Backbone's `sync` method to run against localStorage
 * @param {string} method - One of read/create/update/delete
 * @param {Model} model - Backbone model to sync
 * @param {Object} options - Options object, use `ajaxSync: true` to run the
 *  operation against the server in which case, options will also be passed into
 *  `jQuery.ajax`
 * @returns {undefined}
 */
export function sync(method, model, options = {}) {
  const firestore = getFirestore(model);
  let promise;

  switch (method) {
    case 'read':
      promise = isUndefined(model.id) ? firestore.findAll(model, options) : firestore.find(model, options);
      break;
    case 'create':
      promise = firestore.create(model);
      break;
    case 'patch':
    case 'update':
      promise = firestore.update(model);
      break;
    case 'delete':
      promise = firestore.destroy(model);
      break;
  }
  model.trigger('request', model, promise, options);

  return promise.then(function(resp) {
    let attr = resp === false ? {} : resp;
    if (options.success) {
      options.success.call(model, attr, options);
    }
    return resp;
  }).then(function(resp) {
    // add compatibility with $.ajax
    // always execute callback for success and error
    if (options.complete) {
      options.complete.call(model, resp);
    }
    return resp;
  }).catch(function(error) {
    //console.log(error.message);
    if (options.error) {
      options.error.call(model, error.message, options);
    }
    throw error;
  });

}
