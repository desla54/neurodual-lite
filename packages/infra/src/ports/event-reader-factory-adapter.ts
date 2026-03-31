import type { EventReaderFactoryPort } from '@neurodual/logic';
import { createEventReader } from '../events/event-reader';

export const eventReaderFactoryAdapter: EventReaderFactoryPort = {
  create(persistence) {
    return createEventReader(persistence);
  },
};
