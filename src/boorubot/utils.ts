import { APIApplicationCommandOptionChoice, BaseInteraction } from 'discord.js'
import booru from 'booru'
import { AutocompleteHandler, makeChoices } from 'sleetcord'
import { Reference } from './SettingsCache.js'

/**
 * Get a reference usable to fetch settings for some particular interaction
 * @param interaction The interaction to get a reference for
 * @returns A reference item for this interaction, based on the guild or user id
 */
export function getReferenceFor(interaction: BaseInteraction): Reference {
  return {
    id: interaction.guild?.id ?? interaction.user.id,
    isGuild: interaction.guild !== null,
  }
}

/**
 * Turns a string of space-separated items into an array of items
 * @param str A space-separated string of items
 * @returns The items in the string as an array, trimmed
 */
export function getItemsFrom(str: string): string[] {
  return str
    .split(/[, \n]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== '')
}

export const siteInfo = Object.values(booru.sites)
type SiteInfo = (typeof siteInfo)[0]

interface SiteListResult {
  name: string
  value: string
  sites: string[]
}

type SiteInfoPredicate = Parameters<SiteInfo[]['filter']>['0']

interface SiteListGetOptions {
  filter?: SiteInfoPredicate
}

type GetSiteList = (opts?: SiteListGetOptions) => SiteListResult

interface NamedSiteList {
  name: string
  // Getter since we potentially might dynamically generate this based on what's currently blacklisted (or not)
  get: GetSiteList
}

/**
 * Not real sites, but "helpful shortcuts" like all sites, all nsfw sites... etc
 */
const siteLists: NamedSiteList[] = [
  {
    name: 'list: all sites',
    get: ({ filter = () => true }: SiteListGetOptions = {}) => {
      const allSites = siteInfo.filter(filter)

      return {
        name: `All Sites (${allSites.length})`,
        value: 'list: all sites',
        sites: allSites.map((s) => s.domain),
      }
    },
  },

  {
    name: 'list: nsfw sites',
    get: ({ filter = () => true }: SiteListGetOptions = {}) => {
      const nsfwSites = siteInfo.filter((s, i, a) => s.nsfw && filter(s, i, a))

      return {
        name: `NSFW Sites (${nsfwSites.length})`,
        value: 'list: nsfw sites',
        sites: nsfwSites.map((s) => s.domain),
      }
    },
  },

  {
    name: 'list: sfw sites',
    get: ({ filter = () => true }: SiteListGetOptions = {}) => {
      const sfwSites = siteInfo.filter((s, i, a) => !s.nsfw && filter(s, i, a))

      return {
        name: `SFW Sites (${sfwSites.length})`,
        value: 'list: sfw sites',
        sites: sfwSites.map((s) => s.domain),
      }
    },
  },
]

/**
 * Try and resolve a string to a site, using the domain + aliases
 * @param value The value to try and resolve a single site (potentially returning multiple matches)
 * @returns The match(es) found, as an array of SiteInfo objects
 */
export function resolveSitesFor(value: string) {
  const lowerValue = value.toLowerCase()

  return siteInfo.filter(
    (info) =>
      info.domain.toLowerCase().includes(lowerValue) ||
      info.aliases.some((alias) => alias.toLowerCase().includes(lowerValue)),
  )
}

/**
 * Try and resolve a string to a list of sites (ie. all sites, all nsfw, all sfw...)
 * @param value The value to try and match against a special list of sites (potentially returning multiple matches)
 * @returns The match(es) found, as an array of SiteListResults
 */
export function resolveListsFor(
  value: string,
  filter: SiteInfoPredicate = () => true,
): SiteListResult[] {
  const lowerValue = value.toLowerCase()

  return siteLists
    .filter((special) => special.name.includes(lowerValue))
    .map((special) => special.get({ filter }))
}

/**
 * Try and resolve a string to a site or list of sites, using domain + aliases for single sites or a special list of sites
 * @param value The value to try and match against a single site or a list of sites (potentially retuning multiple matches)
 * @returns The match(es) found, as an array of SiteListResults
 */
export function resolveSitesAndListsFor(
  value: string,
  filter: SiteInfoPredicate = () => true,
): SiteListResult[] {
  const lowerValue = value.toLowerCase()

  const sites = resolveSitesFor(lowerValue).map((s) => ({
    name: s.domain,
    value: s.domain,
    sites: [s.domain],
  }))

  const lists = resolveListsFor(lowerValue, filter)

  return [...lists, ...sites]
}

export const autocompleteSite: AutocompleteHandler<string> = ({ value }) => {
  return resolveSitesFor(value).map((site) => ({
    name: site.domain,
    value: site.domain,
  }))
}

export const autocompleteSiteOrList: AutocompleteHandler<string> = ({
  value,
}) => {
  return resolveSitesAndListsFor(value).map((opt) => ({
    name: opt.name,
    value: opt.value,
  }))
}

export const siteChoices: APIApplicationCommandOptionChoice<string>[] =
  makeChoices(siteInfo.map((site) => site.domain))

/**
 * Clones an array and then shuffles the clone in-place using Durstenfeld's algorithm
 * @param array The array to clone
 * @returns The array, shuffled
 */
export function shuffleArray<T>(array: T[]): T[] {
  const clone = array.slice()

  for (let i = clone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[clone[i], clone[j]] = [clone[j], clone[i]]
  }

  return clone
}
