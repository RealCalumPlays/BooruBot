import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { AutocompleteHandler, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { Reference, settingsCache } from '../SettingsCache.js'
import {
  getReferenceFor,
  resolveListsFor,
  resolveSitesAndListsFor,
} from '../utils.js'
import { formatBlacklist, getBlacklistFor } from './utils.js'

type AutocompleteType = 'add' | 'remove'

function buildSiteAutocomplete(
  type: AutocompleteType,
): AutocompleteHandler<string> {
  return async ({ interaction, value }) => {
    const reference = getReferenceFor(interaction)

    const guildSites = await settingsCache.getSites(reference.id)

    const listSites = (
      type === 'remove'
        ? // To remove, we union (non-zero) special lists and guild lists
          resolveListsFor(value, (s) => guildSites.includes(s.domain))
        : // To add, we exclude guild lists from the possible list
          resolveSitesAndListsFor(value, (s) => !guildSites.includes(s.domain))
    ).filter((r) => r.sites.length > 0)

    const options =
      type === 'remove'
        ? [
            ...listSites,
            ...guildSites.map((s) => ({
              name: s,
              value: s,
            })),
          ]
        : listSites.filter(
            (site) => !guildSites.some((guildSite) => guildSite === site.value),
          )

    return options.sort().slice(0, 25)
  }
}

export const blacklistAddSite = new SleetSlashSubcommand(
  {
    name: 'site',
    description: 'Add a site to the blacklist',
    options: [
      {
        name: 'site',
        description: 'The site to add',
        type: ApplicationCommandOptionType.String,
        autocomplete: buildSiteAutocomplete('add'),
        required: true,
      },
    ],
  },
  {
    run: makeSiteAction(addSites),
  },
)

export const blacklistRemoveSite = new SleetSlashSubcommand(
  {
    name: 'site',
    description: 'Remove a site from the blacklist',
    options: [
      {
        name: 'site',
        description: 'The site to remove',
        type: ApplicationCommandOptionType.String,
        autocomplete: buildSiteAutocomplete('remove'),
        required: true,
      },
    ],
  },
  {
    run: makeSiteAction(removeSites),
  },
)

type SiteAction = (reference: Reference, sites: string[]) => Promise<void>

function makeSiteAction(siteAction: SiteAction) {
  return async function (interaction: ChatInputCommandInteraction) {
    const reference = getReferenceFor(interaction)
    await settingsCache.get(reference)

    const currentSites = await prisma.site.findMany({
      where: { referenceId: reference.id },
    })

    const userSite = interaction.options.getString('site', true)

    const sites = resolveSitesAndListsFor(userSite)
    const resolvedUserSite = currentSites.find((s) => s.name === userSite)

    if (resolvedUserSite) {
      sites.push({
        name: resolvedUserSite.name,
        value: resolvedUserSite.name,
        sites: [resolvedUserSite.name],
      })
    }

    if (sites.length < 1) {
      return interaction.reply({
        content: "Couldn't resolve a single site, try using the autocomplete",
        ephemeral: true,
      })
    }

    const flatSites = sites.flatMap((s) => s.sites)

    const defer = interaction.deferReply()
    await siteAction(reference, flatSites)
    await defer

    const formattedBlacklist = formatBlacklist(
      await getBlacklistFor(reference.id),
      {
        highlightSites: flatSites,
      },
    )

    return interaction.editReply(formattedBlacklist)
  }
}

async function addSites(reference: Reference, sites: string[]) {
  const sitesToAdd = sites.map((site) => ({
    referenceId: reference.id,
    name: site,
  }))

  await prisma.$transaction(
    sitesToAdd.map((data) =>
      prisma.site.upsert({
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

  settingsCache.deleteSites(reference.id)
}

async function removeSites(reference: Reference, sites: string[]) {
  await prisma.site.deleteMany({
    where: { name: { in: sites } },
  })

  settingsCache.deleteSites(reference.id)
}
