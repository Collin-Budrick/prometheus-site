export const shouldActivateDockMotion = ({
  hoverMatches,
  pointerType
}: {
  hoverMatches: boolean
  pointerType?: string | null
}) => hoverMatches && pointerType !== 'touch'
