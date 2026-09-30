namespace Jellyfin.Plugin.SeerrFin.Configuration;

public static class SeerrFinTabConfigHelper
{
    private const string JellyfinHomeKey = "jf:home";
    private const string JellyfinFavoritesKey = "jf:favorites";

    private static readonly HashSet<string> KnownTabIds = new(SeerrFinTabConfig.CreateDefaults().Select(tab => tab.Id), StringComparer.OrdinalIgnoreCase);

    public static List<SeerrFinTabConfig> Normalize(IEnumerable<SeerrFinTabConfig>? tabs)
    {
        var defaults = SeerrFinTabConfig.CreateDefaults();
        if (tabs == null)
        {
            return defaults;
        }

        var enabledById = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        var titleById = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (SeerrFinTabConfig tab in tabs)
        {
            string id = (tab.Id ?? string.Empty).Trim().ToLowerInvariant();
            if (KnownTabIds.Contains(id))
            {
                // Last entry stays, so duped list remains state that was read recently instead of a default.
                enabledById[id] = tab.Enabled;
                string title = (tab.Title ?? string.Empty).Trim();
                if (!string.IsNullOrEmpty(title))
                {
                    titleById[id] = title;
                }
            }
        }

        foreach (SeerrFinTabConfig tab in defaults)
        {
            if (enabledById.TryGetValue(tab.Id, out bool enabled))
            {
                tab.Enabled = enabled;
            }

            if (titleById.TryGetValue(tab.Id, out string? title))
            {
                tab.Title = title;
            }
        }

        return defaults;
    }

    private static string SeerrFinKey(string id) => $"sf:{id.Trim().ToLowerInvariant()}";

    private static string CustomTabsKey(int index) => $"ct:{index}";

    private static bool TryParseSeerrFinKey(string? key, out string id)
    {
        id = string.Empty;
        if (string.IsNullOrWhiteSpace(key) || !key.StartsWith("sf:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        id = key[3..].Trim().ToLowerInvariant();
        return KnownTabIds.Contains(id);
    }

    private static bool TryParseCustomTabsKey(string? key, out int index)
    {
        index = -1;
        if (string.IsNullOrWhiteSpace(key) || !key.StartsWith("ct:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return int.TryParse(key[3..], out index) && index >= 0;
    }

    public static List<string> NormalizeBarOrder(IEnumerable<string>? barOrder)
    {
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void TryAdd(string key)
        {
            if (seen.Add(key))
            {
                result.Add(key);
            }
        }

        TryAdd(JellyfinHomeKey);
        TryAdd(JellyfinFavoritesKey);

        foreach (string raw in barOrder ?? Array.Empty<string>())
        {
            string key = (raw ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(key))
            {
                continue;
            }

            if (KnownTabIds.Contains(key))
            {
                key = SeerrFinKey(key);
            }

            if (string.Equals(key, JellyfinHomeKey, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(key, JellyfinFavoritesKey, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (TryParseSeerrFinKey(key, out string sfId))
            {
                TryAdd(SeerrFinKey(sfId));
                continue;
            }

            if (TryParseCustomTabsKey(key, out int ctIndex))
            {
                TryAdd(CustomTabsKey(ctIndex));
            }
        }

        foreach (SeerrFinTabConfig tab in SeerrFinTabConfig.CreateDefaults())
        {
            string key = SeerrFinKey(tab.Id);
            if (seen.Contains(key))
            {
                continue;
            }

            if (tab.Id == "discover")
            {
                int requestsIndex = result.FindIndex(item => string.Equals(item, SeerrFinKey("requests"), StringComparison.OrdinalIgnoreCase));
                if (requestsIndex >= 0)
                {
                    seen.Add(key);
                    result.Insert(requestsIndex, key);
                    continue;
                }
            }

            TryAdd(key);
        }

        return result;
    }
}
