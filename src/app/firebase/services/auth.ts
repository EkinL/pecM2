import {
  OAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../init";
import { normalizeRequiredPassword, normalizeRequiredString } from "../helpers";

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const signInWithApple = async () => {
  const provider = new OAuthProvider("apple.com");
  return signInWithPopup(auth, provider);
};

export const signUpWithEmail = async ({ email, password }) => {
  const normalizedEmail = normalizeRequiredString(email, "Email");
  const normalizedPassword = normalizeRequiredPassword(password);

  return createUserWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
};

export const signInWithEmail = async ({ email, password }) => {
  const normalizedEmail = normalizeRequiredString(email, "Email");
  const normalizedPassword = normalizeRequiredPassword(password);

  return signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
};

export const signOutUser = async () => signOut(auth);
