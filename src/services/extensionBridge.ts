import { onAuthStateChanged } from 'firebase/auth'
import { auth, firebaseApp } from './firebase'
import { useVaultStore } from '@/stores/vault'
import { bufferToBase64 } from '@/crypto/keyDerivation'

/**
 * Pont pour l'extension navigateur (ObsidKey_Extension).
 *
 * L'extension ne détient aucun secret : pas de compte, pas de mot de passe maître, pas de clé
 * persistée. Elle emprunte la session de cet onglet le temps d'afficher la liste, puis tout
 * disparaît à la fermeture de son popup. Fermer cet onglet ou verrouiller le coffre lui coupe
 * donc immédiatement l'accès.
 *
 * Note de sécurité : la clé de coffre exposée ici est déjà lisible par tout script tournant sur
 * cette page (le store la garde en sessionStorage pour survivre à un rafraîchissement), ce pont
 * n'élargit donc pas la surface d'attaque. En revanche il ne répond QUE sur des messages
 * provenant de cette même origine, et jamais quand le coffre est verrouillé.
 */

const REQUEST = 'obsidkey-ext:request'
const RESPONSE = 'obsidkey-ext:response'

type SessionPayload =
  | { status: 'signed-out' }
  | { status: 'locked' }
  | {
      status: 'unlocked'
      uid: string
      idToken: string
      projectId: string
      vaultKey: string
    }

/** Firebase restaure sa session de façon asynchrone : on attend le premier état connu. */
function authReady(): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe()
      resolve()
    })
  })
}

async function buildSessionPayload(): Promise<SessionPayload> {
  await authReady()

  const user = auth.currentUser
  if (!user) return { status: 'signed-out' }

  const vault = useVaultStore()
  vault.checkTimeout()
  if (!vault.isUnlocked || !vault.rawKeyMaterial) return { status: 'locked' }

  return {
    status: 'unlocked',
    uid: user.uid,
    idToken: await user.getIdToken(),
    projectId: firebaseApp.options.projectId!,
    vaultKey: bufferToBase64(vault.rawKeyMaterial),
  }
}

export function installExtensionBridge(): void {
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return

    const data = event.data
    if (data?.type !== REQUEST || typeof data.requestId !== 'string') return

    window.postMessage(
      { type: RESPONSE, requestId: data.requestId, payload: await buildSessionPayload() },
      window.location.origin,
    )
  })
}
