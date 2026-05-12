import * as nodeCrypto from 'node:crypto'
import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'

let _dfnsClient: DfnsApiClient | null = null

export function getDfnsClient(): DfnsApiClient {
  if (_dfnsClient) return _dfnsClient

  const pemString = env.DFNS_PRIVATE_KEY.replace(/\\n/g, '\n')

  // Pre-parse the key at startup so OpenSSL decodes it once (eager) rather than
  // inside crypto.sign() during every signing request (lazy). This surfaces any
  // DECODER error immediately and avoids the "DECODER routines::unsupported" failure
  // that can occur on Alpine Linux / OpenSSL 3 when a raw PEM string is decoded
  // inside an active signing call.
  let privateKey: nodeCrypto.KeyObject
  try {
    privateKey = nodeCrypto.createPrivateKey(pemString)
    logger.info('DFNS private key loaded successfully', { keyType: privateKey.asymmetricKeyType })
  } catch (err) {
    logger.error('Failed to load DFNS private key — check DFNS_PRIVATE_KEY format', { err })
    throw err
  }

  const signer = new AsymmetricKeySigner({
    credId: env.DFNS_CRED_ID,
    privateKey: privateKey as unknown as string,
  })

  _dfnsClient = new DfnsApiClient({
    orgId: env.DFNS_ORG_ID,
    authToken: env.DFNS_AUTH_TOKEN,
    baseUrl: env.DFNS_API_URL,
    signer,
  })

  return _dfnsClient
}
