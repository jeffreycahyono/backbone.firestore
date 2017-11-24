import { result } from 'underscore';

/** Returns the firestore adapter attribute for a model
 * @param {Model} model - Model to get firestore adapter
 * @returns {FirestoreAdapter} The firestore adapter instance
 */
export function getFirestore(model) {
  return result(model, 'firestore') || result(model.collection, 'firestore');
}
