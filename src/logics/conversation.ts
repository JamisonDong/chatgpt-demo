import { getProviderById } from '@/stores/provider'
import { clearMessagesByConversationId, getMessagesByConversationId, pushMessageByConversationId } from '@/stores/messages'
import { getSettingsByProviderId } from '@/stores/settings'
import { setStreamByConversationId } from '@/stores/streams'
import { currentErrorMessage } from '@/stores/ui'
import type { HandlerPayload, PromptResponse, Provider } from '@/types/provider'
import type { Conversation } from '@/types/conversation'
import type { ErrorMessage, Message } from '@/types/message'

export const handlePrompt = async(conversation: Conversation, prompt: string) => {
  const provider = getProviderById(conversation?.providerId)
  if (!provider) return

  if (conversation.conversationType !== 'continuous')
    clearMessagesByConversationId(conversation.id)
  // if (!conversation.messages.length && !conversation.name) {
  //   updateConversationById(conversation.id, {
  //     name: prompt,
  //   })
  // }

  pushMessageByConversationId(conversation.id, {
    id: `${conversation.id}:user:${Date.now()}`,
    role: 'user',
    content: prompt,
    dateTime: new Date().getTime(),
  })

  const providerResponse: PromptResponse = await callProviderHandler({
    conversation,
    provider,
    prompt,
    historyMessages: getMessagesByConversationId(conversation.id),
  })

  if (providerResponse) {
    const messageId = `${conversation.id}:assistant:${Date.now()}`
    if (providerResponse instanceof ReadableStream) {
      setStreamByConversationId(conversation.id, {
        messageId,
        stream: providerResponse,
      })
    }
    pushMessageByConversationId(conversation.id, {
      id: messageId,
      role: 'assistant',
      content: typeof providerResponse === 'string' ? providerResponse : '',
      stream: providerResponse instanceof ReadableStream,
      dateTime: new Date().getTime(),
    })
  }
}

interface CallProviderPayload {
  conversation: Conversation
  provider: Provider
  prompt: string
  historyMessages: Message[]
}

const callProviderHandler = async(payload: CallProviderPayload) => {
  const { conversation, provider, prompt, historyMessages } = payload
  let response: PromptResponse
  const handlerPayload: HandlerPayload = {
    conversationId: conversation.id,
    globalSettings: getSettingsByProviderId(provider.id),
    conversationSettings: {},
    systemRole: '',
    mockMessages: [],
  }
  console.log('callProviderHandler', handlerPayload)
  try {
    if (conversation.conversationType === 'single') {
      response = await provider.handleSinglePrompt?.(prompt, handlerPayload)
    } else if (conversation.conversationType === 'continuous') {
      const messages = historyMessages.map(message => ({
        role: message.role,
        content: message.content,
      }))
      response = await provider.handleContinuousPrompt?.(messages, handlerPayload)
    } else if (conversation.conversationType === 'image') {
      response = await provider.handleImagePrompt?.(prompt, handlerPayload)
    }

    return response
  } catch (e) {
    const error = e as Error
    const cause = error?.cause as ErrorMessage
    console.error(e)
    currentErrorMessage.set({
      code: cause?.code || 'provider_error',
      message: cause?.message || error.message || 'Unknown error',
    })
    return null
  }
}
