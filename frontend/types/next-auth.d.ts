import { AuthUser } from './api.types';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken:  string;
    refreshToken: string;
    user:         AuthUser;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken:  string;
    refreshToken: string;
    user:         AuthUser;
  }
}
