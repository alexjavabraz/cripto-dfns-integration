import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'
import { env } from '../../config/env.js'

let _dfnsClient: DfnsApiClient | null = null

export function getDfnsClient(): DfnsApiClient {
  if (_dfnsClient) return _dfnsClient

  const signer = new AsymmetricKeySigner({
    credId: env.DFNS_CRED_ID,
    privateKey: env.DFNS_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })

  _dfnsClient = new DfnsApiClient({
    orgId: env.DFNS_ORG_ID,
    authToken: env.DFNS_AUTH_TOKEN,
    baseUrl: env.DFNS_API_URL,
    signer,
  })

  return _dfnsClient
}
