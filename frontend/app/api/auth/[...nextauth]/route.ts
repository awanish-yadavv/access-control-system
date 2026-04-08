import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { AuthUser } from '@/types/api.types';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        });

        if (!res.ok) return null;
        const { data } = await res.json();
        if (!data?.accessToken) return null;

        return {
          id:           data.user.id,
          email:        data.user.email,
          accessToken:  data.accessToken,
          refreshToken: data.refreshToken,
          user:         data.user as AuthUser,
        };
      },
    }),
  ],

  session: { strategy: 'jwt' },
  secret:  process.env.NEXTAUTH_SECRET,

  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        // First sign-in — store tokens
        const u = user as unknown as { accessToken: string; refreshToken: string; user: AuthUser };
        token.accessToken  = u.accessToken;
        token.refreshToken = u.refreshToken;
        token.user         = u.user;
      }
      return token;
    },

    session: async ({ session, token }) => {
      session.accessToken  = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.user         = token.user as AuthUser;
      return session;
    },
  },

  pages: {
    signIn: '/login',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
