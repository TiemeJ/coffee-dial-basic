import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  deleteField,
  query,
  orderBy,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase.js';
import { generateCoffeeName, normalizeRecipe, mergeDrinkIntoMethods } from './utils.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logOut() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

function recipesRef(uid) {
  return collection(db, 'users', uid, 'simpleRecipes');
}

function recipeRef(uid, recipeId) {
  return doc(db, 'users', uid, 'simpleRecipes', recipeId);
}

export async function fetchOpenRecipes(uid) {
  const snap = await getDocs(query(recipesRef(uid), orderBy('createdAt', 'desc')));
  return snap.docs
    .map((d) => normalizeRecipe({ id: d.id, ...d.data() }))
    .filter((r) => r.isOpen !== false);
}

export async function fetchAllRecipes(uid) {
  const snap = await getDocs(query(recipesRef(uid), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => normalizeRecipe({ id: d.id, ...d.data() }));
}

export async function fetchRecipe(uid, recipeId) {
  const snap = await getDoc(recipeRef(uid, recipeId));
  if (!snap.exists()) return null;
  return normalizeRecipe({ id: snap.id, ...snap.data() });
}

export async function createRecipe(uid, data) {
  const name = data.name?.trim() || generateCoffeeName(data);
  const payload = {
    name,
    roaster: data.roaster || '',
    farmer: data.farmer || '',
    origin: data.origin || '',
    variety: data.variety || '',
    processing: data.processing || '',
    roastType: data.roastType || '',
    isOpen: true,
    createdAt: new Date().toISOString(),
    methods: data.methods || {},
  };
  const ref = await addDoc(recipesRef(uid), payload);
  return { id: ref.id, ...payload };
}

export async function appendDrinkToRecipe(uid, recipeId, methodName, drinkName, drinkParams) {
  const recipe = await fetchRecipe(uid, recipeId);
  if (!recipe) return null;
  const methods = mergeDrinkIntoMethods(recipe.methods, methodName, drinkName, drinkParams);
  await updateRecipe(uid, recipeId, { methods, isOpen: true });
  return { ...recipe, methods, isOpen: true };
}

export async function saveRecipePin(uid, recipeId, pinMethods) {
  const hasAny = Object.values(pinMethods).some((drinks) => Array.isArray(drinks) && drinks.length > 0);
  await updateDoc(recipeRef(uid, recipeId), {
    pin: hasAny ? { methods: pinMethods } : deleteField(),
  });
}

export async function updateRecipe(uid, recipeId, data) {
  await updateDoc(recipeRef(uid, recipeId), data);
}

export async function deleteRecipe(uid, recipeId) {
  await deleteDoc(recipeRef(uid, recipeId));
}

export async function ensureUserDoc(uid, displayName) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, { displayName: displayName || '', isPublic: false });
  }
}
