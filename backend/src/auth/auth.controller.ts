import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { InMemoryStoreService } from '../identity/in-memory-store.service';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from '../common/request-context';
import { requireEmail, requireString } from '../common/validation';

@Controller('auth')
export class AuthController {
  constructor(private readonly store: InMemoryStoreService) {}

  @Post('sign-in')
  signIn(@Body() body: Record<string, unknown>) {
    const email = requireEmail(body.email, 'email');
    const name =
      body.name === undefined
        ? undefined
        : requireString(body.name, 'name', 80);

    return this.store.signIn(email, name);
  }

  @Get('session')
  @UseGuards(AuthGuard)
  getSession(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  @Post('sign-out')
  @UseGuards(AuthGuard)
  signOut(@Req() request: AuthenticatedRequest) {
    this.store.signOut(request.sessionToken, request.user.id);
    return { ok: true };
  }
}
