import type { DefaultSession } from 'next-auth';

// 擴展 next-auth 的 Session type：讓 session.user.id 有正確 TS 型別
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}
