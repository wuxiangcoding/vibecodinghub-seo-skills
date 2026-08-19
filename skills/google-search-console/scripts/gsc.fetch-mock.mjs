function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));

  if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
    const form = new URLSearchParams(init.body);
    if (form.get('grant_type') !== 'refresh_token') {
      return jsonResponse({ error: 'unsupported_grant_type' }, 400);
    }
    if (form.get('refresh_token') !== 'mock-initial-refresh-token') {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }
    return jsonResponse({
      access_token: 'mock-fresh-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    });
  }

  if (url.origin !== 'https://www.googleapis.com') {
    throw new Error(`Unexpected mock request: ${url}`);
  }

  const authorization = new Headers(init.headers).get('authorization');
  if (authorization !== 'Bearer mock-fresh-access-token') {
    return jsonResponse({ error: { message: 'invalid authorization' } }, 401);
  }

  if (url.pathname === '/webmasters/v3/sites') {
    return jsonResponse({
      siteEntry: [
        {
          siteUrl: 'sc-domain:example.com',
          permissionLevel: 'siteOwner',
        },
        {
          siteUrl: 'https://www.example.com/',
          permissionLevel: 'siteRestrictedUser',
        },
      ],
    });
  }

  if (url.pathname.endsWith('/searchAnalytics/query')) {
    const request = JSON.parse(init.body);
    if (!Array.isArray(request.dimensions)) {
      return jsonResponse({ error: { message: 'dimensions must be an array' } }, 400);
    }
    if (request.dimensions.length === 0) {
      return jsonResponse({
        responseAggregationType: 'byProperty',
        rows: [{ clicks: 30, impressions: 300, ctr: 0.1, position: 4.5 }],
      });
    }
    if (request.dimensions.join(',') === 'query') {
      const startRow = Number(request.startRow || 0);
      const rows = startRow === 0
        ? [
          { keys: ['alpha'], clicks: 10, impressions: 100, ctr: 0.1, position: 3 },
          { keys: ['beta'], clicks: 8, impressions: 80, ctr: 0.1, position: 4 },
        ]
        : startRow === 2
          ? [{ keys: ['gamma'], clicks: 2, impressions: 20, ctr: 0.1, position: 5 }]
          : [];
      return jsonResponse({ responseAggregationType: 'byProperty', rows });
    }
    return jsonResponse({ responseAggregationType: 'byProperty', rows: [] });
  }

  return jsonResponse({ error: { message: 'not found' } }, 404);
};
