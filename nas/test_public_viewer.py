"""Public presentation updates without putting sharing data on the UI host."""
import asyncio,ssl,unittest
from unittest.mock import patch
import httpx
from starlette.testclient import TestClient
import public_gateway as pg
HTML=b'<!doctype html><html lang="ko"><title>Public presentation</title></html>'
async def inner(scope,receive,send):
 await send({'type':'http.response.start','status':404,'headers':[]});await send({'type':'http.response.body','body':b'private route unavailable'})
class PublicViewerTest(unittest.TestCase):
 def setup_gateway(self,handler):
  gateway=pg.PublicGateway(inner,'never-send-service-secret');original=httpx.AsyncClient;options=[]
  def client(**kwargs):
   options.append(kwargs);return original(transport=httpx.MockTransport(handler),**kwargs)
  return gateway,options,patch.object(pg.httpx,'AsyncClient',side_effect=client)
 def test_asset_request_never_forwards_incoming_secrets_or_share_token(self):
  requests=[]
  def handler(request):requests.append(request);return httpx.Response(200,headers={'Content-Type':'text/html'},content=HTML if len(requests)==1 else HTML.replace(b'presentation',b'updated presentation'))
  gateway,options,mocked=self.setup_gateway(handler)
  with mocked:
   client=TestClient(gateway);reply=client.get('/public/share/'+'a'*43,headers={'Cookie':'private-session=value','Authorization':'Bearer private-user','Referer':'https://nas.test/private'})
   self.assertEqual(reply.status_code,200);self.assertEqual(reply.content,HTML)
   self.assertEqual(len(requests),1);request=requests[0];self.assertEqual(str(request.url),pg.DEFAULT_VIEWER_URL)
   for header in ('cookie','authorization','referer','origin','x-auth-session'):self.assertNotIn(header,request.headers)
   self.assertNotIn('a'*43,str(request.url));self.assertNotIn('never-send-service-secret',str(request.headers))
   self.assertIn("connect-src 'self'",reply.headers['content-security-policy']);self.assertEqual(reply.headers['referrer-policy'],'no-referrer');self.assertEqual(reply.headers['cache-control'],'no-store')
   self.assertFalse(options[0]['follow_redirects']);self.assertFalse(options[0]['trust_env']);self.assertIsInstance(options[0]['verify'],ssl.SSLContext)
   self.assertEqual(client.get('/public/share/'+'b'*43).content,HTML);self.assertEqual(len(requests),1)
   gateway.viewer_until=0;self.assertIn(b'updated presentation',client.get('/public/share/'+'c'*43).content);self.assertEqual(len(requests),2)
 def test_network_failure_uses_only_cached_public_markup_or_returns_503(self):
  gateway=pg.PublicGateway(inner,'secret')
  with patch.object(pg,'fetch_viewer',side_effect=httpx.ConnectError('unavailable')):
   self.assertEqual(TestClient(gateway).get('/public/share/'+'a'*43).status_code,503)
   gateway.viewer_cache=HTML;gateway.viewer_until=0
   reply=TestClient(gateway).get('/public/share/'+'b'*43);self.assertEqual(reply.status_code,200);self.assertEqual(reply.content,HTML)
 def test_redirect_wrong_mime_and_oversized_assets_are_rejected(self):
  for response in [httpx.Response(302,headers={'Location':'https://elsewhere.invalid'}),httpx.Response(200,headers={'Content-Type':'application/json'},content=b'{}'),httpx.Response(200,headers={'Content-Type':'text/html'},content=b'x'*(pg.MAX_VIEWER_BYTES+1)),httpx.Response(200,headers={'Content-Type':'text/html'},content=b'not HTML')]:
   gateway,_,mocked=self.setup_gateway(lambda request:response)
   with mocked:self.assertEqual(TestClient(gateway).get('/public/share/'+'a'*43).status_code,503)
 def test_invalid_source_is_rejected_before_network(self):
  for url in ['http://example.test/viewer','https://user:secret@example.test/viewer','https://example.test/viewer?token=secret','https://example.test/viewer#secret']:
   with self.assertRaises(ValueError):asyncio.run(pg.fetch_viewer(url))
