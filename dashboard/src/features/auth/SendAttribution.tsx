import { useEffect } from 'react';
import { sendAttribution } from '@/lib/attribution';
import { useAuth } from '@/lib/auth/AuthProvider';

/** Renders nothing. The first time a person is signed in, tells the API where they came from (see lib/attribution.ts). */
export function SendAttribution() {
  const { status, user } = useAuth();
  const id = user?.id;
  useEffect(() => {
    if (status === 'signedIn' && id) void sendAttribution(id);
  }, [status, id]);
  return null;
}
