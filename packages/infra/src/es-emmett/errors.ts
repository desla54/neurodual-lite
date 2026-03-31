/**
 * Erreurs dédiées pour l'Event Store Emmett.
 *
 * Fournit des types d'erreur spécifiques pour une meilleure gestion des erreurs de concurrence
 * et des streams manquants.
 */

/**
 * Erreur de concurrence: la version attendue du stream ne correspond pas à la version actuelle.
 * Se produit lorsque deux commandes tentent de modifier le même stream simultanément.
 */
export class ConcurrencyError extends Error {
  constructor(
    public streamId: string,
    public expectedVersion: bigint,
    public actualVersion: bigint,
  ) {
    super(
      `[ConcurrencyError] Stream ${streamId}: expected version ${expectedVersion}, got ${actualVersion}`,
    );
    this.name = 'ConcurrencyError';
  }
}

/**
 * Erreur de stream non trouvé: le stream n'existe pas.
 * Se produit lors d'une tentative de lecture ou de modification d'un stream qui n'existe pas.
 */
export class StreamNotFoundError extends Error {
  constructor(streamId: string) {
    super(`[StreamNotFoundError] Stream ${streamId} does not exist`);
    this.name = 'StreamNotFoundError';
  }
}

/**
 * Erreur de stream existant: le stream existe déjà alors qu'il ne devrait pas.
 * Se produit lors d'une tentative de création d'un stream qui existe déjà.
 */
export class StreamAlreadyExistsError extends Error {
  constructor(streamId: string) {
    super(`[StreamAlreadyExistsError] Stream ${streamId} already exists`);
    this.name = 'StreamAlreadyExistsError';
  }
}
