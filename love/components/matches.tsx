import { BinaryContract } from 'common/contract'
import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { AddAMatchButton } from './match-buttons'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Lover } from 'love/hooks/use-lover'
import { Row } from 'web/components/layout/row'
import { getProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'

export const Matches = (props: { userId: string }) => {
  const { userId } = props
  const lovers = useLovers()
  const matches = useMatches(userId)

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === userId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers.filter(
    (lover) => !matchesSet.has(lover.user_id)
  )

  return (
    <Col className="bg-canvas-0 max-w-sm gap-4 rounded px-4 py-3">
      {matches && matches.length > 0 && (
        <Col className="gap-2">
          <div className="text-lg font-semibold">
            Chance of 6 month relationship
          </div>
          {matches.map((contract) => {
            const matchedLoverId =
              contract.loverUserId1 === userId
                ? contract.loverUserId2
                : contract.loverUserId1
            const matchedLover = lovers.find(
              (lover) => lover.user_id === matchedLoverId
            )
            return (
              matchedLover && (
                <MatchContract
                  key={contract.id}
                  contract={contract}
                  lover={matchedLover}
                />
              )
            )
          })}
        </Col>
      )}

      {lover && (
        <AddAMatchButton lover={lover} potentialLovers={potentialLovers} />
      )}
    </Col>
  )
}

const MatchContract = (props: { contract: BinaryContract; lover: Lover }) => {
  const { contract, lover } = props
  const prob = getProbability(contract)
  const { user } = lover
  return (
    <Row className="justify-between">
      <UserLink name={user.name} username={user.username} />
      <div className="font-semibold">{formatPercent(prob)}</div>
    </Row>
  )
}