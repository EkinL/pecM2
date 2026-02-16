'use client';

import { FormEvent, useState } from 'react';
import { addCours, deleteCours } from '../../indexFirebase';

export default function UsersPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmitDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = formData.get('id')?.toString().trim();

    if (!id) {
      setError("L'ID est obligatoire pour la suppression.");
      return;
    }

    setIsSubmitting(true);

    try {
      await deleteCours(id);
      form.reset();
      setSuccess('Cours supprimé avec succès.');
    } catch (err) {
      console.error('Erreur lors de la suppression du cours', err);
      setError('Impossible de supprimer le cours, veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const coursName = formData.get('coursName')?.toString().trim();
    const prof = formData.get('prof')?.toString().trim();
    const hours = formData.get('hours')?.toString().trim();

    if (!coursName || !prof) {
      setError('Le cours et le professeur sont obligatoires.');
      return;
    }

    setIsSubmitting(true);

    try {
      await addCours({ coursName, prof, hours });
      form.reset();
      setSuccess('Cours ajouté avec succès.');
    } catch (err) {
      console.error('Erreur lors de la création du cours', err);
      setError("Impossible d'ajouter le cours, veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <form method="POST" id="addUtilisateur" onSubmit={handleSubmit}>
        <label htmlFor="coursName">Cours</label>
        <input type="text" name="coursName" id="coursName" required />

        <label htmlFor="prof">Nom du prof</label>
        <input type="text" name="prof" id="prof" required />

        <label htmlFor="hours">Nombre d&apos;heures</label>
        <input type="number" name="hours" id="hours" min="0" step="1" />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Envoi...' : 'Envoyer'}
        </button>
      </form>
      <form method="DELETE" onSubmit={handleSubmitDelete}>
        <label htmlFor="id">ID du document à supprimer :</label>
        <input type="text" name="id" required />
        <button>Supprimer ce cours</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
}
