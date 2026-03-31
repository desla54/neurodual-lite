import type { ReadModelPort } from '@neurodual/logic';
import type { ProfileReadModel, JourneyReadModel } from '@neurodual/infra';

let readModelsAdapter: ReadModelPort | null = null;
let profileReadModelInstance: ProfileReadModel | null = null;
let journeyReadModelInstance: JourneyReadModel | null = null;

export function setReadModelsAdapter(adapter: ReadModelPort): void {
  readModelsAdapter = adapter;
}

export function getReadModelsAdapter(): ReadModelPort {
  if (!readModelsAdapter) {
    throw new Error('ReadModels adapter not initialized. Call setReadModelsAdapter first.');
  }
  return readModelsAdapter;
}

export function setProfileReadModel(instance: ProfileReadModel): void {
  profileReadModelInstance = instance;
}

export function getProfileReadModel(): ProfileReadModel {
  if (!profileReadModelInstance) {
    throw new Error('ProfileReadModel not initialized. Call setProfileReadModel first.');
  }
  return profileReadModelInstance;
}

export function setJourneyReadModel(instance: JourneyReadModel): void {
  journeyReadModelInstance = instance;
}

export function getJourneyReadModel(): JourneyReadModel {
  if (!journeyReadModelInstance) {
    throw new Error('JourneyReadModel not initialized. Call setJourneyReadModel first.');
  }
  return journeyReadModelInstance;
}
