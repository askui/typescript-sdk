import https from 'https';
import http from 'http';

import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { AddressInfo } from 'net';
import { HttpClientGot } from '../http/http-client-got';
import { buildProxy, buildSecureServer, SERVER_HOSTNAME } from '../../../test/proxy/proxy-utils';

describe('HttpClient proxy', () => {
  let httpClient: HttpClientGot;
  let proxy: http.Server;
  let httpServer: https.Server;
  let serverUrl: string;

  beforeEach(async () => {
    proxy = await buildProxy(0);
    const proxyUrl = `http://localhost:${(proxy.address() as AddressInfo).port}`;

    const porxyAgents: { http: http.Agent, https: https.Agent } = {
      http: new HttpProxyAgent({
        keepAlive: false,
        proxy: proxyUrl,
      }),
      https: new HttpsProxyAgent({
        keepAlive: false,
        proxy: proxyUrl,
      }),
    };
    httpClient = new HttpClientGot(undefined, undefined, {}, porxyAgents);

    httpServer = await buildSecureServer(0);
    serverUrl = `https://${SERVER_HOSTNAME}:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    proxy.close();
  });

  it('should get result with proxy ', async () => {
    httpServer.on('request', (_req, res) => res.end('{"ok": "test"}'));
    let connectedToProxy = false;
    proxy.on('connect', () => { connectedToProxy = true; });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await httpClient.get<any>(serverUrl);

    expect(JSON.stringify(response)).toBe('{"ok":"test"}');
    expect(connectedToProxy).toBeTruthy();

    httpServer.close();
  });

  it('should post result with proxy ', async () => {
    httpServer.on('request', (_req, res) => res.end('{"ok": "test"}'));
    let connectedToProxy = false;
    proxy.on('connect', () => { connectedToProxy = true; });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await httpClient.post<any>(serverUrl, {});

    expect(JSON.stringify(response.body)).toBe('{"ok":"test"}');
    expect(connectedToProxy).toBeTruthy();

    httpServer.close();
  });
});
