import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const proxyRequest = async (req: NextRequest, segments: string[]): Promise<NextResponse> => {
  const session = await getServerSession(authOptions);
  const path    = segments.join('/');
  const search  = req.nextUrl.searchParams.toString();
  const url     = `${BACKEND_URL}/api/${path}${search ? `?${search}` : ''}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = JSON.stringify(await req.json());
    } catch {
      body = undefined;
    }
  }

  const response = await fetch(url, {
    method:  req.method,
    headers,
    body,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
};

export const GET    = async (req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) => proxyRequest(req, (await params).proxy);
export const POST   = async (req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) => proxyRequest(req, (await params).proxy);
export const PATCH  = async (req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) => proxyRequest(req, (await params).proxy);
export const DELETE = async (req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) => proxyRequest(req, (await params).proxy);
