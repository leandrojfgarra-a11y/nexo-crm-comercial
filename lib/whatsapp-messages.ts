export type WhatsAppMessageContext = {
  contactName: string
  companyName?: string | null
  activity?: string | null
  productName?: string | null
}

function contextValues(context: WhatsAppMessageContext) {
  return {
    contact: context.contactName.trim() || 'tudo bem',
    company: context.companyName?.trim() || context.contactName.trim() || 'sua empresa',
    activity: context.activity?.trim() || '',
    product: context.productName?.trim() || '',
  }
}

export function messageForFunnelStage(stage: string, context: WhatsAppMessageContext) {
  const value = contextValues(context)
  switch (stage) {
    case 'Leads':
      return `Olá, ${value.contact}! Aqui é da Garra Automação. ${value.activity ? `Vi que a ${value.company} atua com ${value.activity}. ` : ''}Podemos conversar sobre soluções para o seu negócio?`
    case '1º contato':
      return `Olá, ${value.contact}! Estou retomando nosso primeiro contato. Você conseguiu ver minha mensagem? Posso explicar como a Garra Automação pode ajudar a ${value.company}.`
    case 'Em análise':
      return `Olá, ${value.contact}! Ficou alguma dúvida${value.product ? ` sobre a proposta de ${value.product}` : ` sobre a solução para a ${value.company}`}? Estou à disposição para esclarecer e ajustar o que for necessário.`
    case 'Aprovado':
      return `Olá, ${value.contact}! Vamos alinhar os próximos passos para formalizar a proposta da ${value.company}. Qual horário fica melhor para conversarmos?`
    case 'Contrato assinado':
      return `Olá, ${value.contact}! Obrigado pela confiança na Garra Automação. Vamos combinar os próximos passos para iniciar o atendimento da ${value.company}.`
    case 'Taxa paga':
      return `Olá, ${value.contact}! Confirmamos o pagamento da taxa de implantação. Vamos organizar o início da implantação e o treinamento da ${value.company}.`
    case 'Concluído':
      return `Olá, ${value.contact}! Como está sendo a experiência da ${value.company} com a solução? Se precisar de ajuda, estamos à disposição.`
    default:
      return `Olá, ${value.contact}! Aqui é da Garra Automação. Podemos conversar?`
  }
}

export function messageForLeadStatus(status: string, context: WhatsAppMessageContext) {
  switch (status) {
    case 'new': return messageForFunnelStage('Leads', context)
    case 'contacted': return messageForFunnelStage('1º contato', context)
    case 'qualified': return messageForFunnelStage('Em análise', context)
    case 'converted': return messageForFunnelStage('Contrato assinado', context)
    case 'lost': {
      const value = contextValues(context)
      return `Olá, ${value.contact}! Aqui é da Garra Automação. Se a ${value.company} voltar a avaliar essa solução, ficaremos à disposição para conversar.`
    }
    default: return messageForFunnelStage('Leads', context)
  }
}

export function messageForAccountantRelationship(relationship: string | null | undefined, context: WhatsAppMessageContext) {
  const value = contextValues(context)
  if (relationship === 'partner') {
    return `Olá, ${value.contact}! Aqui é da Garra Automação. Estou passando para fortalecer nossa parceria com ${value.company} e saber como podemos apoiar você nas demandas dos clientes em comum. Há alguma oportunidade em que possamos colaborar?`
  }
  if (relationship === 'lead') {
    return `Olá, ${value.contact}! Aqui é da Garra Automação. Gostaria de conhecer melhor o trabalho de ${value.company} e conversar sobre como podemos colaborar no atendimento aos nossos clientes em comum. Podemos falar?`
  }
  return `Olá, ${value.contact}! Aqui é da Garra Automação. Podemos conversar?`
}
