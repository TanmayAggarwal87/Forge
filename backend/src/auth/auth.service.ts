import { Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/request-context';
import {
  requireEmail,
  requirePassword,
  requireString,
} from '../common/validation';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Injectable()
export class AuthService {
  constructor(private readonly store: InMemoryStoreService) {}

  register(body: Record<string, unknown>) {
    const email = requireEmail(body.email, 'email');
    const password = requirePassword(body.password);
    const name = requireString(body.name, 'name', 80);

    return this.store.register(email, password, name);
  }

  login(body: Record<string, unknown>) {
    const email = requireEmail(body.email, 'email');
    const password = requirePassword(body.password);

    return this.store.login(email, password);
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
