declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: Record<string, unknown>): any;
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare function serve(
  handler: (req: Request) => Response | Promise<Response>,
): void;
