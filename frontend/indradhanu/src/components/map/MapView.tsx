import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type {
  Incident,
  LngLat,
  Resource,
  Shelter,
  Ward,
  WardRisk,
} from "@/api/types"
import { cssColor, severityVar } from "@/lib/tokens"
import { useTheme } from "@/components/theme-provider"

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

const PUNE_CENTER: LngLat = [73.8567, 18.5104]

/* Minimal GeoJSON shapes, so we do not depend on @types/geojson. */
type Feature = {
  type: "Feature"
  id?: string
  properties: Record<string, unknown>
  geometry:
    | { type: "Polygon"; coordinates: LngLat[][] }
    | { type: "LineString"; coordinates: LngLat[] }
}
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] }

export interface MapViewProps {
  wards: Ward[]
  risks?: WardRisk[]
  incidents?: Incident[]
  resources?: Resource[]
  shelters?: Shelter[]
  route?: LngLat[] | null
  focusWardId?: string | null
  selectedWardId?: string | null
  onSelectWard?: (wardId: string | null) => void
  className?: string
  zoom?: number
}

export function MapView({
  wards,
  risks = [],
  incidents = [],
  resources = [],
  shelters = [],
  route = null,
  focusWardId = null,
  selectedWardId = null,
  onSelectWard,
  className,
  zoom = 11.1,
}: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const ready = useRef(false)
  const markers = useRef<mapboxgl.Marker[]>([])
  const { theme } = useTheme()
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  /* ---- init ---- */
  useEffect(() => {
    if (!container.current || map.current) return
    map.current = new mapboxgl.Map({
      container: container.current,
      style: dark
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11",
      center: PUNE_CENTER,
      zoom,
      attributionControl: false,
    })
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right"
    )
    map.current.on("load", () => {
      ready.current = true
      draw()
    })
    return () => {
      map.current?.remove()
      map.current = null
      ready.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- theme swap ---- */
  useEffect(() => {
    if (!map.current || !ready.current) return
    map.current.setStyle(
      dark
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11"
    )
    map.current.once("styledata", () => draw())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])

  /* ---- data ---- */
  function draw() {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return

    const riskBy = new Map(risks.map((r) => [r.wardId, r]))
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: wards.map((w) => {
        const r = riskBy.get(w.id)
        return {
          type: "Feature",
          id: w.id,
          properties: {
            id: w.id,
            name: w.name,
            number: w.number,
            score: r?.score ?? 0,
            severity: r?.severity ?? 0,
            color: r
              ? cssColor(severityVar[r.severity])
              : dark
                ? "#2b2b2b"
                : "#e9edf1",
            hasRisk: r ? 1 : 0,
          },
          geometry: { type: "Polygon", coordinates: [w.boundary] },
        }
      }),
    }

    const src = m.getSource("wards") as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(fc as never)
    } else {
      m.addSource("wards", { type: "geojson", data: fc as never })
      m.addLayer({
        id: "ward-fill",
        type: "fill",
        source: "wards",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["==", ["get", "hasRisk"], 1], 0.55, 0.28],
        },
      })
      m.addLayer({
        id: "ward-line",
        type: "line",
        source: "wards",
        paint: {
          "line-color": dark ? "#8a8a8a" : "#5a6b7b",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2.4,
            0.7,
          ],
        },
      })
      m.addLayer({
        id: "ward-label",
        type: "symbol",
        source: "wards",
        layout: {
          "text-field": ["concat", ["get", "number"], " · ", ["get", "name"]],
          "text-size": 10.5,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": dark ? "#e7e7e7" : "#22303c",
          "text-halo-color": dark ? "#111111" : "#ffffff",
          "text-halo-width": 1.2,
        },
      })
      m.on("click", "ward-fill", (e) => {
        const f = e.features?.[0] as
          { properties?: Record<string, unknown> } | undefined
        if (f?.properties) onSelectWard?.(String(f.properties.id))
      })
      m.on("mouseenter", "ward-fill", () => {
        m.getCanvas().style.cursor = "pointer"
      })
      m.on("mouseleave", "ward-fill", () => {
        m.getCanvas().style.cursor = ""
      })
    }

    /* evacuation route */
    const routeFc: FeatureCollection = {
      type: "FeatureCollection",
      features: route
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: route },
            },
          ]
        : [],
    }
    const rsrc = m.getSource("route") as mapboxgl.GeoJSONSource | undefined
    if (rsrc) {
      rsrc.setData(routeFc as never)
    } else {
      m.addSource("route", { type: "geojson", data: routeFc as never })
      m.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": cssColor("--primary", "#7bd320"),
          "line-width": 4,
          "line-dasharray": [1.6, 1.1],
        },
      })
    }

    drawMarkers()
  }

  function drawMarkers() {
    const m = map.current
    if (!m) return
    markers.current.forEach((mk) => mk.remove())
    markers.current = []

    const add = (loc: LngLat, el: HTMLElement) => {
      markers.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat(loc).addTo(m)
      )
    }

    shelters.forEach((s) => {
      const el = document.createElement("div")
      el.className =
        "flex size-5 items-center justify-center rounded-sm border border-background bg-foreground text-background text-[9px] font-bold shadow"
      el.textContent = "S"
      el.title = `${s.name} — ${s.occupancy}/${s.capacity}`
      add(s.location, el)
    })

    resources.forEach((r) => {
      const el = document.createElement("div")
      const color =
        r.status === "en_route"
          ? "bg-status-active"
          : r.status === "assigned"
            ? "bg-status-pending"
            : "bg-muted-foreground"
      el.className = `size-2.5 rounded-full border border-background ${color} shadow`
      el.title = `${r.label} — ${r.status.replace("_", " ")}`
      add(r.location, el)
    })

    incidents.forEach((i) => {
      const el = document.createElement("div")
      el.className =
        "flex size-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-white shadow-md"
      el.style.backgroundColor = cssColor(severityVar[i.severity])
      el.textContent = String(i.reportCount)
      el.title = `${i.title} — ${i.reportCount} reports`
      add(i.location, el)
    })
  }

  useEffect(() => {
    if (ready.current) draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wards, risks, incidents, resources, shelters, route])

  /* ---- selection + focus ---- */
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    wards.forEach((w) =>
      m.setFeatureState(
        { source: "wards", id: w.id },
        { selected: w.id === selectedWardId }
      )
    )
  }, [selectedWardId, wards])

  useEffect(() => {
    const m = map.current
    if (!m || !focusWardId) return
    const w = wards.find((x) => x.id === focusWardId)
    if (w)
      m.flyTo({
        center: w.centroid,
        zoom: 12.6,
        duration: 1600,
        essential: true,
      })
  }, [focusWardId, wards])

  return <div ref={container} className={className} />
}
