import { Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/request-context';
import { requireEmail, requireString } from '../common/validation';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Injectable()
export class AuthService {
  constructor(private readonly store: InMemoryStoreService) {}

  signIn(body: Record<string, unknown>) {
    const email = requireEmail(body.email, 'email');
    const password = requireString(body.password, 'password', 128);
    const name =
      body.name === undefined
        ? undefined
        : requireString(body.name, 'name', 80);

    return this.store.signIn(email, password, name);
  }

  getSession(request: AuthenticatedRequest) {
    return { user: request.user };
  }

  resolveSession(token: string) {
    return this.store.getSession(token);
  }

  signOut(request: AuthenticatedRequest) {
    this.store.signOut(request.sessionToken, request.user.id);
    return { ok: true };
  }
}
