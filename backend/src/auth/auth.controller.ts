import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from '../common/request-context';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-in')
  signIn(@Body() body: Record<string, unknown>) {
    return this.authService.login(body);
  }

  @Post('login')
  login(@Body() body: Record<string, unknown>) {
    return this.authService.login(body);
  }

  @Post('register')
  register(@Body() body: Record<string, unknown>) {
    return this.authService.register(body);
  }

  @Get('session')
  @UseGuards(AuthGuard)
  getSession(@Req() request: AuthenticatedRequest) {
    return this.authService.getSession(request);
  }

  @Post('sign-out')
  @UseGuards(AuthGuard)
  signOut(@Req() request: AuthenticatedRequest) {
    return this.authService.signOut(request);
  }
}
