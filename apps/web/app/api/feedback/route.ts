import { createServiceClient } from '../../../lib/supabase';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getDataset, getSchemaForDataset } from '../../../lib/env';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, email, website } = body;

    // 1. HONEYPOT CHECK
    // If 'website' field is filled, it's a bot.
    // We return 200 OK to fool the bot, but we DO NOT save the data.
    if (website && website.length > 0) {
      console.warn('[Anti-Spam] Honeypot triggered. Request silently rejected.');
      return NextResponse.json({ success: true, message: 'Feedback received.' });
    }

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 2. CONTEXT EXTRACTION
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || 'Unknown';
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'Unknown IP';
    const language = headersList.get('accept-language') || 'Unknown';

    // Simple User Agent Parsing
    let browser = 'Unknown';
    let os = 'Unknown';

    if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    if (userAgent.includes('Win')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'MacOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    const context = {
      ip,
      user_agent: userAgent,
      language,
      browser,
      os,
      url: headersList.get('referer') || '',
    };

    // Dataset Logic
    // We use getDataset() which handles client overrides, env vars, and Vercel environments.
    const targetDataset = getDataset(body.dataset);
    const targetSchema = getSchemaForDataset(targetDataset);

    console.log(`[FeedbackAPI] Dataset: ${targetDataset}, Schema: ${targetSchema}`);

    const supabase = createServiceClient(targetSchema);

    const { error } = await supabase
      .from('feedback')
      .insert({
        message,
        email,
        context
      });

    if (error) {
      console.error('Feedback Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (e: any) {
    console.error('Feedback API Error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
