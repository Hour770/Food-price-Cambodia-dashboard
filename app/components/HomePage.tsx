/**
 * Cambodia Food Price Dashboard
 * 
 * This is a client-side rendered page that displays retail food prices
 * across provinces, districts, and markets in Cambodia.
 * 
 * Features:
 * - Filter by province, district, and food item
 * - View KPI summary cards (average price, market count, item count)
 * - Display price data in a table format
 * - Show average prices by province in a bar chart
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Province with nested districts for cascading filter */
type Province = { id: number; name: string; districts: { id: number; name: string }[] };

/** Food item with unit and category information */
type Item = { id: number; name: string; unit: string; category: string };

/** Individual price record with location and market details */
type PriceRow = {
  id: number;
  item: string;
  category: string;
  unit: string;
  price: number;
  currency: string;
  date: string;
  province: string;
  district: string;
  market: string;
};

/** Deduplicated price row with trend indicator */
type DeduplicatedPriceRow = PriceRow & {
  previousPrice: number | null;  // Previous price for comparison
  trend: "up" | "down" | "same" | null;  // Price trend indicator
};

/** Summary statistics for the dashboard KPI cards */
type Overview = {
  lastUpdated: string | null;
  totalItems: number;
  totalMarkets: number;
  averagePrice: number | null;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function HomePage() {
  // i18n hooks
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  // ---------------------------------------------------------------------------
  // STATE: Data from API
  // ---------------------------------------------------------------------------
  const [provinces, setProvinces] = useState<Province[]>([]); // Province list for filter dropdown
  const [items, setItems] = useState<Item[]>([]);             // Food items for filter dropdown
  const [prices, setPrices] = useState<PriceRow[]>([]);       // Price records for the table
  const [overview, setOverview] = useState<Overview | null>(null); // KPI summary stats
  const [averages, setAverages] = useState<{ province: string; averagePrice: number }[]>([]); // Per-province averages

  // ---------------------------------------------------------------------------
  // STATE: Filter selections
  // ---------------------------------------------------------------------------
  const [provinceId, setProvinceId] = useState<number | undefined>();
  const [districtId, setDistrictId] = useState<number | undefined>();
  const [itemName, setItemName] = useState<string | undefined>(); // Use item name for consistent filtering

  // ---------------------------------------------------------------------------
  // STATE: UI loading indicator
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // STATE: Pagination for table rows
  // ---------------------------------------------------------------------------
  const [visibleRows, setVisibleRows] = useState(10);

  // ---------------------------------------------------------------------------
  // EFFECT: Load filter options (provinces & items) on initial mount or locale change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch(`/api/filters?locale=${currentLocale}`, { cache: "no-store" });
        if (!res.ok) {
          console.error('Failed to load filters:', res.status);
          return;
        }
        const data = await res.json();
        setProvinces(data.provinces || []); // Populate province dropdown
        setItems(data.items || []);         // Populate food item dropdown (all items initially)
        // Reset selections when locale changes
        setProvinceId(undefined);
        setDistrictId(undefined);
        setItemName(undefined);
      } catch (error) {
        console.error('Error loading filters:', error);
      }
    }
    loadFilters();
  }, [currentLocale]); // Re-run when locale changes

  // ---------------------------------------------------------------------------
  // EFFECT: Reload food items when province or district changes
  // Shows only items available in the selected location
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadFilteredItems() {
      try {
        // Build query string for location filter
        const query = new URLSearchParams();
        query.append("locale", currentLocale);
        if (provinceId) query.append("province", String(provinceId));
        if (districtId) query.append("district", String(districtId));

        const res = await fetch(`/api/filters?${query.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          console.error('Failed to load filtered items:', res.status);
          return;
        }
        const data = await res.json();
        setItems(data.items || []); // Update items based on selected location
        
        // Reset item selection if current item is not available in new location
        if (itemName && data.items && !data.items.some((i: Item) => i.name === itemName)) {
          setItemName(undefined);
        }
      } catch (error) {
        console.error('Error loading filtered items:', error);
      }
    }
    loadFilteredItems();
  }, [provinceId, districtId, currentLocale]); // Re-run when location or locale changes

  // ---------------------------------------------------------------------------
  // EFFECT: Reload price data and overview stats when filters change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setVisibleRows(10); // Reset pagination when filters change
      
      try {
        // Build query string from active filters
        const query = new URLSearchParams();
        query.append("locale", currentLocale);
        if (provinceId) query.append("province", String(provinceId));
        if (districtId) query.append("district", String(districtId));
        if (itemName) query.append("item", itemName);

        // Fetch price data and overview stats in parallel
        const [pricesRes, overviewRes] = await Promise.all([
          fetch(`/api/prices?${query.toString()}`, { cache: "no-store" }),
          fetch(`/api/overview?${query.toString()}`, { cache: "no-store" }),
        ]);

        if (!pricesRes.ok || !overviewRes.ok) {
          console.error('Failed to load data:', pricesRes.status, overviewRes.status);
          setLoading(false);
          return;
        }

        const pricesJson = await pricesRes.json();
        const overviewJson = await overviewRes.json();

        // Update state with fetched data
        setPrices(pricesJson.data || []);
        setOverview(overviewJson.overview || null);
        setAverages(overviewJson.averages || []);
      } catch (error) {
        console.error('Error loading data:', error);
      }
      setLoading(false);
    }

    loadData();
  }, [provinceId, districtId, itemName, currentLocale]); // Re-run when any filter or locale changes

  // ---------------------------------------------------------------------------
  // COMPUTED: Get districts for the currently selected province
  // ---------------------------------------------------------------------------
  const filteredDistricts = useMemo(() => {
    if (!provinceId) return [] as Province["districts"];
    return provinces.find((p) => p.id === provinceId)?.districts ?? [];
  }, [provinceId, provinces]);

  // ---------------------------------------------------------------------------
  // COMPUTED: Number formatter for displaying prices and counts
  // ---------------------------------------------------------------------------
  const numberFormat = useMemo(() => new Intl.NumberFormat("en-KH"), []);

  // ---------------------------------------------------------------------------
  // COMPUTED: Deduplicate prices with different grouping strategies:
  // - No filters: Group by item, show all 19 food items with highest price among 25 provinces
  // - Only food filter: Group by item + province, show all 25 provinces ordered by highest price
  // - Province filter: Group by item + district, show all districts
  // - Province + District filter: Group by item only
  // ---------------------------------------------------------------------------
  const deduplicatedPrices = useMemo((): DeduplicatedPriceRow[] => {
    // Helper function to check if price is non-zero (handles string/number)
    const isNonZeroPrice = (price: number | string): boolean => {
      const numPrice = typeof price === 'string' ? parseFloat(price) : price;
      return numPrice !== 0 && !isNaN(numPrice) && numPrice !== null && numPrice !== undefined;
    };

    // Determine grouping strategy based on filters
    // Case 1: No province, no item filter - group by item only, show highest price per item
    // Case 2: No province, has item filter - group by item + province, show all provinces sorted by price
    // Case 3: Has province (with or without district) - group by item only, show highest price per item in that province
    let groupingMode: 'no-filters' | 'food-only' | 'province-selected';
    
    if (!provinceId && !itemName) {
      groupingMode = 'no-filters';
    } else if (!provinceId && itemName) {
      groupingMode = 'food-only';
    } else {
      // Province is selected (with or without district filter)
      groupingMode = 'province-selected';
    }

    const itemGroups = new Map<string, PriceRow[]>();
    
    prices.forEach((row) => {
      // Skip rows with missing item name
      if (!row.item) return;
      
      let groupKey: string;
      if (groupingMode === 'no-filters') {
        // Group by item only - show one entry per food item with highest price
        groupKey = row.item;
      } else if (groupingMode === 'food-only') {
        // Group by item + province - show all provinces for the selected food
        groupKey = `${row.item}|||${row.province}`;
      } else {
        // Province selected - group by item only, show highest price per food in this province
        groupKey = row.item;
      }
      const existing = itemGroups.get(groupKey) || [];
      existing.push(row);
      itemGroups.set(groupKey, existing);
    });

    // For each group, get the appropriate price based on grouping mode
    const result: DeduplicatedPriceRow[] = [];
    
    itemGroups.forEach((rows, key) => {
      // Filter to only non-zero prices first
      const nonZeroRows = rows.filter(row => isNonZeroPrice(row.price));
      
      // If no non-zero price exists, skip this item
      if (nonZeroRows.length === 0) {
        return;
      }

      let latest: PriceRow;
      let previous: PriceRow | null = null;

      // For all modes: find the highest non-zero price in the group
      const sortedByPrice = [...nonZeroRows].sort((a, b) => b.price - a.price);
      latest = sortedByPrice[0];
      // Previous is the second highest price for trend comparison
      previous = sortedByPrice[1] || null;
      
      // Determine price trend
      let trend: "up" | "down" | "same" | null = null;
      if (previous) {
        if (latest.price > previous.price) {
          trend = "up";
        } else if (latest.price < previous.price) {
          trend = "down";
        } else {
          trend = "same";
        }
      }

      result.push({
        ...latest,
        previousPrice: previous?.price || null,
        trend,
      });
    });

    // Sort based on grouping mode
    if (groupingMode === 'food-only') {
      // When filtering by food only, sort by price descending (highest first)
      return result.sort((a, b) => b.price - a.price);
    } else {
      // Otherwise sort by item name, then by province/district
      return result.sort((a, b) => {
        const itemCompare = a.item.localeCompare(b.item);
        if (itemCompare !== 0) return itemCompare;
        return a.province.localeCompare(b.province);
      });
    }
  }, [prices, provinceId, districtId, itemName]);

  // ===========================================================================
  // RENDER: Main dashboard layout
  // ===========================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        
        {/* -------------------------------------------------------------------
            HEADER SECTION: Title, subtitle, and filter controls
        ------------------------------------------------------------------- */}
        <header className="flex flex-col gap-4">
          {/* Language Switcher */}
          <div className="flex justify-end">
            <div className="inline-flex items-center rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
              <button
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                  currentLocale === 'en' 
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => {
                  if (currentLocale !== 'en') router.push(`/en${pathname.replace(/^\/[a-z]{2}/, '')}`);
                }}
              >
                EN
              </button>
              <button
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                  currentLocale === 'km' 
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => {
                  if (currentLocale !== 'km') router.push(`/km${pathname.replace(/^\/[a-z]{2}/, '')}`);
                }}
              >
                ខ្មែរ
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-600">{t('monitor')}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('dashboardTitle')}</h1>
              <p className="text-sm text-slate-600">{t('dashboardSubtitle')}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-cyan-700 ring-1 ring-slate-200">
              {t('updated')} "June 19, 2023"
            </span>
          </div>

          {/* Filter dropdowns: Province → District → Food Item */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Province filter - resets district when changed */}
            <FilterSelect
              label={t('province')}
              value={provinceId ? String(provinceId) : ""}
              onChange={(value) => {
                const nextProvince = value ? Number(value) : undefined;
                setProvinceId(nextProvince);
                setDistrictId(undefined);
              }}
              options={[{ value: "", label: t('allProvinces') }, ...provinces.map((p) => ({ value: String(p.id), label: p.name }))]}
            />
            {/* District filter - disabled until province is selected */}
            <FilterSelect
              label={t('district')}
              value={districtId ? String(districtId) : ""}
              onChange={(value) => setDistrictId(value ? Number(value) : undefined)}
              options={[
                { value: "", label: provinceId ? t('allDistricts') : t('pickProvince') },
                ...filteredDistricts.map((d) => ({ value: String(d.id), label: d.name })),
              ]}
              disabled={!provinceId}
            />
            {/* Food item filter - shows items available in selected location */}
            <FilterSelect
              label={t('foodItem')}
              value={itemName || ""}
              onChange={(value) => setItemName(value || undefined)}
              options={[
                { value: "", label: provinceId ? `${t('allItemsIn')} ${provinces.find(p => p.id === provinceId)?.name || t('location')}` : t('allFoodItems') },
                ...items.map((i) => ({ value: i.name, label: `${i.name} (${i.unit})` }))
              ]}
            />
          </div>
        </header>

        {/* -------------------------------------------------------------------
            KPI SECTION: Summary statistics cards
        ------------------------------------------------------------------- */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard title={t('averagePrice')} value={overview?.averagePrice ? `${numberFormat.format(Math.round(overview.averagePrice))} KHR` : "—"} detail={t('simpleMean')} />
          <KpiCard title={t('marketsTracked')} value={overview ? numberFormat.format(overview.totalMarkets) : "—"} detail={t('uniqueMarkets')} />
          <KpiCard title={t('foodItems')} value={overview ? numberFormat.format(overview.totalItems) : "—"} detail={t('distinctItems')} />
        </section>

        {/* -------------------------------------------------------------------
            MAIN CONTENT: Price table and sidebar widgets
        ------------------------------------------------------------------- */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-start">
          
          {/* Price data table - spans 2 columns on large screens */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t('latestPricePrints')}</h2>
                <p className="text-sm text-slate-600">{t('uniqueItems')}</p>
              </div>
              {loading && <span className="text-xs text-cyan-600">{t('loading')}</span>}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <table className="w-full text-sm text-slate-800">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">{t('item')}</th>
                    <th className="px-3 py-2">{t('location')}</th>
                    <th className="px-3 py-2">{t('market')}</th>
                    <th className="px-3 py-2 text-right">{t('price')}</th>
                    <th className="px-3 py-2 text-center">{t('trend')}</th>
                    <th className="px-3 py-2 text-right">{t('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Display deduplicated price records with trend indicators */}
                  {deduplicatedPrices.slice(0, visibleRows).map((row) => (
                    <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{row.item}</div>
                        <div className="text-xs text-slate-500">{row.category} · {row.unit}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm text-slate-900">{row.province}</div>
                        <div className="text-xs text-slate-500">{row.district}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.market}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-semibold text-cyan-600">{numberFormat.format(row.price)} {row.currency}</div>
                        {row.previousPrice && (
                          <div className="text-xs text-slate-500">
                            {t('was')} {numberFormat.format(row.previousPrice)} {row.currency}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <PriceTrendBadge trend={row.trend} labels={{ up: t('up'), down: t('down'), same: t('same') }} />
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{row.date}</td>
                    </tr>
                  ))}
                  {/* Empty state when no data matches filters */}
                  {!deduplicatedPrices.length && !loading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        {t('noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {/* Show More / Show Less buttons */}
              {deduplicatedPrices.length > 0 && (
                <div className="flex justify-center gap-3 py-3 border-t border-slate-200 bg-slate-50">
                  {visibleRows < deduplicatedPrices.length ? (
                    <button
                      onClick={() => setVisibleRows(prev => Math.min(prev + 10, deduplicatedPrices.length))}
                      className="px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors"
                    >
                      {t('showMore')} ({Math.min(10, deduplicatedPrices.length - visibleRows)} {t('moreItems')})
                    </button>
                  ) : visibleRows > 10 ? (
                    <button
                      onClick={() => setVisibleRows(10)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      {t('showLess')}
                    </button>
                  ) : null}
                  <span className="px-3 py-2 text-xs text-slate-500">
                    {t('showing')} {Math.min(visibleRows, deduplicatedPrices.length)} {t('of')} {deduplicatedPrices.length} {t('items')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Bar chart and guidance panel */}
          <div className="lg:sticky lg:top-4">
            {/* Average price by province - horizontal bar chart */}
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{t('averageByProvince')}</h3>
              <p className="text-xs text-slate-600">{t('meanPrice')}</p>
              <div className="mt-3 flex flex-col gap-2 overflow-y-auto max-h-[500px]">
                {averages.map((item) => (
                  <BarRow
                    key={item.province}
                    label={item.province}
                    value={item.averagePrice}
                    max={averages[0]?.averagePrice || 1}
                    formatter={(v) => `${numberFormat.format(Math.round(v))} KHR`}
                  />
                ))}
                {!averages.length && <p className="text-sm text-slate-500">{t('noDataDisplay')}</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

/**
 * FilterSelect - Reusable styled dropdown component with label
 * @param label - Display label above the dropdown
 * @param value - Currently selected value
 * @param onChange - Callback when selection changes
 * @param options - Array of { value, label } pairs for dropdown options
 * @param disabled - Whether the dropdown is disabled
 */
type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
};

function FilterSelect({ label, value, onChange, options, disabled }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200 disabled:opacity-60"
      >
        {options.map((opt, index) => (
          <option key={`${opt.value}-${index}`} value={opt.value} className="bg-white text-slate-800">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * KpiCard - Card component displaying a key performance indicator
 * @param title - KPI title text
 * @param value - Main value to display (formatted string)
 * @param detail - Optional description text below the value
 */
type KpiCardProps = { title: string; value: string; detail?: string };

function KpiCard({ title, value, detail }: KpiCardProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {detail && <p className="text-xs text-slate-600">{detail}</p>}
    </div>
  );
}

/**
 * BarRow - Horizontal bar chart row with label and value
 * @param label - Text label for the bar
 * @param value - Numeric value determining bar width
 * @param max - Maximum value for calculating percentage width
 * @param formatter - Function to format the displayed value
 */
type BarRowProps = {
  label: string;
  value: number;
  max: number;
  formatter: (value: number) => string;
};

function BarRow({ label, value, max, formatter }: BarRowProps) {
  // Calculate bar width as percentage (min 10%, max 100%)
  const width = Math.max(10, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="text-slate-800">{label}</span>
        <span>{formatter(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/**
 * PriceTrendBadge - Badge showing price trend with arrow icon and color
 * @param trend - "up" (price increased), "down" (price decreased), "same" (no change), or null (no previous data)
 * @param labels - Translated labels for up, down, same
 */
type PriceTrendBadgeProps = {
  trend: "up" | "down" | "same" | null;
  labels: { up: string; down: string; same: string };
};

function PriceTrendBadge({ trend, labels }: PriceTrendBadgeProps) {
  if (!trend) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        —
      </span>
    );
  }

  const config = {
    up: {
      icon: "↑",
      label: labels.up,
      className: "bg-red-100 text-red-600",
    },
    down: {
      icon: "↓",
      label: labels.down,
      className: "bg-green-100 text-green-600",
    },
    same: {
      icon: "→",
      label: labels.same,
      className: "bg-slate-100 text-slate-500",
    },
  };

  const { icon, label, className } = config[trend];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}
