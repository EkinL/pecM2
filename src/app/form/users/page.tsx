'use client';

import { FormEvent, useState } from "react";
import { addUtilisateur, updateUtilisateur } from "../../indexFirebase";

export default function UsersPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const mail = formData.get('mail')?.toString().trim();
    const pseudo = formData.get('pseudo')?.toString().trim();
    const adult = formData.get('majeur') === 'true';

    if (!mail || !pseudo) {
      setError('Mail et pseudo sont obligatoires.');
      return;
    }

    setIsSubmitting(true);

    try {
      await addUtilisateur({ mail, pseudo, adult });
      form.reset();
      setSuccess('Utilisateur ajouté avec succès.');
    } catch (err) {
      console.error('Erreur lors de la création de l\'utilisateur', err);
      setError('Impossible d\'ajouter l\'utilisateur, veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = formData.get('id')?.toString().trim();

    if (!id) {
      setError('L\'ID est obligatoire.');
      return;
    }

    setIsSubmitting(true);

    try {
      await updateUtilisateur(id);
      form.reset();
      setSuccess('Utilisateur modifié avec succès.');
    } catch (err) {
      console.error('Erreur lors de la modification de l\'utilisateur', err);
      setError('Impossible de modifier l\'utilisateur, veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <form method="POST" id="addUtilisateur" onSubmit={handleSubmit}>
        <label htmlFor="mail">Mail</label>
        <input type="email" name="mail" id="mail" required />

        <label htmlFor="pseudo">Pseudo</label>
        <input type="text" name="pseudo" id="pseudo" required />

        <label htmlFor="majeur">Majeur</label>
        <select name="majeur" id="majeur" defaultValue="true">
          <option value="true">Majeur</option>
          <option value="false">Mineur</option>
        </select>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Envoi...' : 'Envoyer'}
        </button>
      </form>
      <form action="PUT" onSubmit={handleSubmitUpdate}>
        <label htmlFor="id">ID</label>
        <input type="text" name="id" id="id" required />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Majorité en cours...' : 'Rendre majeur'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
}
