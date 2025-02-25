import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { AutocompleteHandler, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { Reference, settingsCache } from '../SettingsCache.js'
import { getItemsFrom, getReferenceFor } from '../utils.js'
import { formatBlacklist, getBlacklistFor } from './utils.js'

export const blacklistAddTags = new SleetSlashSubcommand(
  {
    name: 'tags',
    description: 'Add tags to the blacklist',
    options: [
      {
        name: 'tags',
        description: 'The tag(s) to add, separated by a space',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    run: makeTagModifier(addTags),
  },
)

const removeTagAutocomplete: AutocompleteHandler<string> = async ({
  interaction,
  value,
}) => {
  const reference = getReferenceFor(interaction)
  const tags = await settingsCache.getTags(reference.id)

  const previousTags = getItemsFrom(value)
  const latestInput = previousTags.pop() ?? ''
  const prevValue = previousTags.join(' ')

  const possibleCompletions = tags.filter(
    (tag) => tag.startsWith(latestInput) && !previousTags.includes(tag),
  )

  if (tags.includes(latestInput)) {
    // Then assume that last input is a full tag and also include more tag suggestions
    possibleCompletions.push(
      ...tags
        .filter((tag) => !previousTags.includes(tag) && tag !== latestInput)
        .map((tag) => `${latestInput} ${tag}`),
    )
  }

  if (possibleCompletions.length === 0) {
    return [
      {
        name: value || 'Enter 1 or more tags to remove, separated by spaces',
        value: value || '',
      },
    ]
  }

  return possibleCompletions
    .sort()
    .map((tag) => {
      const suggestion = `${prevValue} ${tag}`

      return {
        name: suggestion,
        value: suggestion,
      }
    })
    .filter((t) => t.name.length <= 100)
    .slice(0, 25)
}

export const blacklistRemoveTags = new SleetSlashSubcommand(
  {
    name: 'tags',
    description: 'Remove tags from the blacklist',
    options: [
      {
        name: 'tags',
        description: 'The tag(s) to remove, separated by a space',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: removeTagAutocomplete,
      },
    ],
  },
  {
    run: makeTagModifier(removeTags),
  },
)

type TagAction = (reference: Reference, tags: string[]) => Promise<void>

function makeTagModifier(tagAction: TagAction) {
  return async function (interaction: ChatInputCommandInteraction) {
    const reference = getReferenceFor(interaction)
    const tags = getItemsFrom(interaction.options.getString('tags', true))

    if (tags.length === 0) {
      return interaction.reply({
        content: 'You must provide at least one tag',
        ephemeral: true,
      })
    }

    if (tags.some((t) => t.length > 100)) {
      return interaction.reply({
        content: 'Tags must be 100 characters or less',
        ephemeral: true,
      })
    }

    const defer = interaction.deferReply()
    await tagAction(reference, tags)
    await defer

    const formattedBlacklist = formatBlacklist(
      await getBlacklistFor(reference.id),
      {
        highlightTags: tags,
      },
    )

    return interaction.editReply(formattedBlacklist).catch(() => {
      /* ignore */
    })
  }
}

async function addTags(reference: Reference, tags: string[]) {
  await settingsCache.get(reference)

  const tagsToAdd = tags.map((tag) => ({
    referenceId: reference.id,
    name: tag,
  }))

  await prisma.$transaction(
    tagsToAdd.map((data) =>
      prisma.tag.upsert({
        where: {
          referenceId_name: {
            referenceId: data.referenceId,
            name: data.name,
          },
        },
        create: data,
        update: {},
      }),
    ),
  )

  settingsCache.deleteTags(reference.id)
}

async function removeTags(reference: Reference, tags: string[]) {
  await settingsCache.get(reference)

  await prisma.tag.deleteMany({
    where: { name: { in: tags } },
  })

  settingsCache.deleteTags(reference.id)
}
