import { collection } from "firebase/firestore";
import { firestore } from "./init";

export const utilisateurs = collection(firestore, "utilisateurs");
export const cours = collection(firestore, "cours");
export const conversations = collection(firestore, "conversations");
export const iaProfiles = collection(firestore, "iaProfiles");
export const demandes = collection(firestore, "demandes");
export const adminLogs = collection(firestore, "adminLogs");
export const aiEvaluations = collection(firestore, "aiEvaluations");
export const settings = collection(firestore, "settings");

export const conversationMessages = (conversationId) =>
  collection(firestore, "conversations", conversationId, "messages");
