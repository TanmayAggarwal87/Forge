import { Request } from 'express';
import { SessionUser } from '../identity/identity.types';

export type AuthenticatedRequest = Request & {
  user: SessionUser;
  sessionToken: string;
};
