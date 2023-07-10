import * as functions from 'firebase-functions'
import { JSONContent } from '@tiptap/core'

import { getUser, log } from 'shared/utils'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'

import { secrets } from 'common/secrets'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { addContractToFeed } from 'shared/create-feed'
import {
  CONTRACT_OR_USER_FEED_REASON_TYPES,
  INTEREST_DISTANCE_THRESHOLDS,
} from 'common/feed'
import { createNewContractNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isContractLikelyNonPredictive } from 'shared/supabase/contracts'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { NON_PREDICTIVE_GROUP_ID } from 'common/supabase/groups'

export const onCreateContract = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context
    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

    await completeCalculatedQuestFromTrigger(
      contractCreator,
      'MARKETS_CREATED',
      eventId
    )

    const desc = contract.description as JSONContent
    const mentioned = parseMentions(desc)
    await addUserToContractFollowers(contract.id, contractCreator.id)

    await createNewContractNotification(
      contractCreator,
      contract,
      eventId,
      richTextToString(desc),
      mentioned
    )
    const pg = createSupabaseDirectClient()
    const contractEmbedding = await pg.oneOrNone<{ embedding: string }>(
      `select embedding
        from contract_embeddings
        where contract_id = $1`,
      [contract.id]
    )
    const contractHasEmbedding = (contractEmbedding?.embedding ?? []).length > 0
    log('contractHasEmbedding:', contractHasEmbedding)
    if (!contractHasEmbedding) {
      // Wait 5 seconds, hopefully the embedding will be there by then
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    const likelyNonPredictive = await isContractLikelyNonPredictive(
      contract.id,
      pg
    )
    log('likelyNonPredictive:', likelyNonPredictive)
    if (likelyNonPredictive) {
      const added = await addGroupToContract(contract, {
        id: NON_PREDICTIVE_GROUP_ID,
        slug: 'nonpredictive',
        name: 'Non-Predictive',
      })
      log('Added contract to non-predictive group', added)
    }
    const reasons: CONTRACT_OR_USER_FEED_REASON_TYPES[] = ['follow_user']
    if (contract.visibility === 'unlisted') return
    else if (contract.visibility === 'public') {
      reasons.push(
        ...([
          'similar_interest_vector_to_contract',
        ] as CONTRACT_OR_USER_FEED_REASON_TYPES[])
      )
    }
    await addContractToFeed(
      contract,
      reasons,
      'new_contract',
      [contractCreator.id],
      {
        idempotencyKey: eventId,
        maxDistanceFromUserInterestToContract:
          INTEREST_DISTANCE_THRESHOLDS.new_contract,
      }
    )
  })
