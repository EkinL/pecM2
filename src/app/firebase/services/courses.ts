import { addDoc, deleteDoc, doc, getDocs, serverTimestamp } from "firebase/firestore";
import { cours } from "../collections";
import { mapSnapshot, normalizeOptionalNumber, normalizeRequiredString } from "../helpers";

export const fetchCours = async () => {
  try {
    const snapshot = await getDocs(cours);

    return mapSnapshot(snapshot);
  } catch (err) {
    console.error("Erreur lors de la récupération des cours", err);
    throw err;
  }
};

export const addCours = async ({ coursName, prof, hours }: any) => {
  const payload: any = {
    coursName: normalizeRequiredString(coursName, "Cours"),
    prof: normalizeRequiredString(prof, "Professeur"),
    dateOfCreate: serverTimestamp(),
  };

  const normalizedHours = normalizeOptionalNumber(hours);
  if (normalizedHours !== undefined) {
    payload.hours = normalizedHours;
  }

  return addDoc(cours, payload);
};

export const deleteCours = async (id: any) => {
  const normalizedId = normalizeRequiredString(id, "ID");
  const docRef = doc(cours, normalizedId);

  return deleteDoc(docRef);
};
