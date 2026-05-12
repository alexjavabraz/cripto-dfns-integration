import * as nodeCrypto from 'node:crypto'
import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'

let _dfnsClient: DfnsApiClient | null = null

export function getDfnsClient(): DfnsApiClient {
  if (_dfnsClient) return _dfnsClient

  const pemString = env.DFNS_PRIVATE_KEY.replace(/\\n/g, '\n')

  // Parse the key via DER (binary) rather than passing the PEM string directly to
  // OpenSSL. Alpine Linux / OpenSSL 3 has a known issue where the PEM DECODER
  // module fails with "DECODER routines::unsupported" even for valid PKCS#8 RSA
  // keys. Extracting the Base64 payload and decoding it to DER ourselves bypasses
  // the PEM DECODER entirely and uses the always-supported DER decoder instead.
  let privateKey: nodeCrypto.KeyObject
  try {
    const derBuffer = Buffer.from(
      pemString
        .replace(/-----BEGIN[^-]*-----/, '')
        .replace(/-----END[^-]*-----/, '')
        .replace(/\s+/g, ''),
      'base64',
    )
    privateKey = nodeCrypto.createPrivateKey({ key: derBuffer, format: 'der', type: 'pkcs8' })
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
