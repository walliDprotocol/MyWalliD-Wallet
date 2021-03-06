'use strict';

import { get, post } from './http';

const API_VERSION = 'v1';

export function getAuthenticationChallenge(wallet, idt, operation) {
  const url = `https://api.wallid.io/api/${API_VERSION}/auth`;
  const query = {
    client_id: 'wallid-web-dev',
    client_secret: '_password_',
  };
  const data = { wallet, idt, operation };

  return post(url, { data, query }).catch((e) =>
    Promise.reject('ERR_WALLID_API')
  );
}

export function buildAuthorizationToken_v1(token, signature) {
  let authToken = token + ':' + signature;
  console.log(authToken);
  return Promise.resolve(btoa(authToken));
}

export function extractIdentity(auth_token) {
  const url = `https://api.wallid.io/api/${API_VERSION}/extract`;
  const headers = {
    'WalliD-Authorization': auth_token,
  };

  return get(url, { headers });
}
