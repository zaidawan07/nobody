import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image as ImageIcon,
  Video,
  Upload,
  Loader2,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowLeftRight,
  X,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchPropertyMedia, fetchMediaUrl, uploadPropertyMedia, deletePropertyMedia, setCoverMedia, updateMediaCaption, reorderMedia, type MediaRow } from "@/lib/queries";
import { validateMediaFile, optimizeImageForUpload, extractVideoPoster } from "@/lib/media";

// ---------------------------------------------------------------------------
// Property media manager: real uploads to Supabase Storage, state machine per
// file, thumbnails, cover photo, reorder, delete, video posters + playback.
// The RLS on the storage bucket + tables is the authorization boundary; this
// component only shapes the UI.
// ---------------------------------------------------------------------------

type Job = {
  id: string;
  file: File;
  kind?: "photo" | "video" | undefined;
  state: "validated" | "queued" | "optimizing" | "uploading" | "recording" | "complete" | "failed" | "cancelled";
  error?: string | undefined;
};

function LabelFor(state: Job["state"]): string {
  switch (state) {
    case "validated": return "Queued";
    case "queued": return "Queued";
    case "optimizing": return "Preparing";
    case "uploading": return "Uploading";
    case "recording": return "Saving record";
    case "complete": return "Done";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
  }
}

export function PropertyMediaManager({
  propertyId,
  agencyId,
  readOnly = false,
}: {
  propertyId: string;
  agencyId: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: media, isLoading } = useQuery({
    queryKey: ["property-media", propertyId],
    queryFn: () => fetchPropertyMedia(propertyId),
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const queueDirty = useRef(false);
  const cancelledRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [lightbox, setLightbox] = useState<{ index: number; id: null | string; kind?: "photo" | "video" }>({ index: -1, id: null });

  const photos = useMemo(() => (media ?? []).filter((m) => m.kind === "photo"), [media]);
  const videos = useMemo(() => (media ?? []).filter((m) => m.kind === "video"), [media]);

  function failJob(id: string, error: string) {
    setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, state: "failed", error } : j)));
  }
  function setJobState(id: string, state: Job["state"]) {
    setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, state } : j)));
  }

  async function processQueue(validJobs: Job[]) {
    if (validJobs.length === 0) return;
    setRunning(true);
    cancelledRef.current = false;
    let done = 0;
    let failed = 0;
    const total = validJobs.length;
    for (const job of validJobs) {
      if (cancelledRef.current) {
        setJobState(job.id, "cancelled");
        continue;
      }
      try {
        const kind = job.kind ?? (job.file.type.startsWith("video/") ? "video" : "photo");
        setJobState(job.id, "optimizing");
        let mainBlob: Blob = job.file;
        let thumbnailBlob: Blob | undefined;
        let posterBlob: Blob | undefined;
        if (kind === "photo") {
          const { main, thumb } = await optimizeImageForUpload(job.file);
          mainBlob = main;
          thumbnailBlob = thumb;
        } else {
          const poster = await extractVideoPoster(job.file);
          if (poster) posterBlob = poster;
        }
        setJobState(job.id, "uploading");
        await uploadPropertyMedia({
          agencyId,
          propertyId,
          file: mainBlob,
          fileName: job.file.name,
          kind,
          mimeType: kind === "photo" ? "image/jpeg" : job.file.type || "video/mp4",
          sizeBytes: mainBlob.size,
          thumbnailBlob,
          posterBlob,
        });
        setJobState(job.id, "recording");
        setJobState(job.id, "complete");
        done++;
      } catch (e) {
        failJob(job.id, e instanceof Error ? e.message : "Upload failed.");
        failed++;
      }
    }
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] });
    if (failed > 0) toast.error(`${failed} of ${total} file(s) need review/retry.`);
    else if (done > 0) toast.success(`${done} file(s) uploaded.`);
  }

  function enqueue(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fresh: Job[] = [];
    for (const f of Array.from(files)) {
      const verdict = validateMediaFile(f);
      if ("error" in verdict) {
        fresh.push({ id: crypto.randomUUID(), file: f, state: "failed", error: verdict.error });
        continue;
      }
      fresh.push({ id: crypto.randomUUID(), file: f, state: "queued", kind: verdict.kind });
    }
    setJobs((cur) => [...cur, ...fresh]);
    const good = fresh.filter((j) => j.state === "queued") as Job[];
    // chain into the current run or start a new one
    if (running) queueDirty.current = true;
    else void processQueue(good);
  }

  function retryJob(id: string) {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    setJobState(id, "queued");
    void processQueue([{ ...job, state: "queued" }]);
  }

  function retryFailed() {
    const failed = jobsRef.current.filter((j) => j.state === "failed" && !(j.error && j.error.includes("format"))) as Job[];
    if (failed.length > 0) void processQueue(failed.map((j) => ({ ...j, state: "queued", error: undefined })));
  }

  function cancelPending() {
    cancelledRef.current = true;
    setJobs((cur) => cur.map((j) => (j.state === "queued" || j.state === "validated" ? { ...j, state: "cancelled" } : j)));
  }

  const uploadingNow = running;
  const queuedCount = jobs.filter((j) => j.state === "queued").length;
  const failedCount = jobs.filter((j) => j.state === "failed").length;
  const pendingForLabel = jobs.filter((j) => ["queued", "optimizing", "uploading", "recording"].includes(j.state)).length;

  async function moveRow(list: MediaRow[], index: number, dir: -1 | 1) {
    const next = [...list];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const a = next[index]!;
    const b = next[j];
    if (b === undefined) return;
    next[index] = b;
    next[j] = a;
    try {
      await reorderMedia(next.map((m) => m.id));
      queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t reorder.");
    }
  }

  async function doSetCover(id: string | null, confirmRow?: MediaRow) {
    try {
      await setCoverMedia(propertyId, id);
      queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t set cover.");
    }
  }

  return (
    <div className="surface-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">Photos & videos</p>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" asChild>
              <label>
                <Upload className="size-4" /> Photos
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture={undefined} className="hidden" onChange={(e) => enqueue(e.target.files)} />
              </label>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <label>
                <Camera className="size-4" /> Camera
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => enqueue(e.target.files)} />
              </label>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <label>
                <Video className="size-4" /> Videos
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" multiple className="hidden" onChange={(e) => enqueue(e.target.files)} />
              </label>
            </Button>
          </div>
        ) : null}
      </div>

      {jobs.length > 0 ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {running ? `Uploading… ${jobs.filter((j) => j.state === "complete").length} of ${jobs.length} done` : `${jobs.filter((j) => j.state === "complete").length} uploaded`}
            </span>
            {uploadingNow ? (
              <button className="underline" onClick={cancelPending}>Cancel pending</button>
            ) : failedCount > 0 ? (
              <button className="underline" onClick={retryFailed}>Retry failed</button>
            ) : null}
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-md bg-secondary p-2">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between text-xs">
                <span className="truncate">{job.file.name}</span>
                <span className="whitespace-nowrap">
                  {LabelFor(job.state)}
                  {job.state === "failed" ? ": " + (job.error ?? "") : ""}
                  {job.state === "failed" ? (
                    <button className="ml-2 inline-flex items-center gap-1 underline" onClick={() => retryJob(job.id)}>
                      <RefreshCw className="size-3" /> Retry
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-secondary" />
      ) : photos.length === 0 && videos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No media yet. {readOnly ? "" : "Upload photos or a walkthrough video."}</p>
      ) : (
        <>
          {photos.length > 0 ? (
            <>
              <p className="mt-4 text-sm font-medium">Photos</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {photos.map((m, i) => (
                  <PhotoCard
                    key={m.id}
                    media={m}
                    onOpen={() => setLightbox({ index: i, id: m.id, kind: "photo" })}
                    onMoveLeft={readOnly ? undefined : () => moveRow(photos, i, -1)}
                    onMoveRight={readOnly ? undefined : () => moveRow(photos, i, 1)}
                    onDelete={readOnly ? undefined : async () => {
                      if (confirm("Delete this photo?")) {
                        try {
                          await deletePropertyMedia(m);
                          queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] });
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
                      }
                    }}
                    onSetCover={readOnly ? undefined : () => doSetCover(m.id)}
                    onCaption={readOnly ? undefined : async (v: string) => { await updateMediaCaption(m.id, v || null); queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] }); }}
                  />
                ))}
              </div>
            </>
          ) : null}
          {videos.length > 0 ? (
            <>
              <p className="mt-4 text-sm font-medium">Videos</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {videos.map((m, i) => (
                  <VideoCard
                    key={m.id}
                    media={m}
                    onOpen={() => setLightbox({ index: i, id: m.id, kind: "video" })}
                    onMoveLeft={readOnly ? undefined : () => moveRow(videos, i, -1)}
                    onMoveRight={readOnly ? undefined : () => moveRow(videos, i, 1)}
                    onCaption={readOnly ? undefined : async (v: string) => { await updateMediaCaption(m.id, v || null); queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] }); }}
                    onDelete={readOnly ? undefined : async () => {
                      if (confirm("Delete this video?")) {
                        try {
                          await deletePropertyMedia(m);
                          queryClient.invalidateQueries({ queryKey: ["property-media", propertyId] });
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
                      }
                    }}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {lightbox.id !== null && lightbox.kind === "photo" ? (
        <LightboxPhotos
          photos={photos}
          startIndex={Math.max(0, lightbox.index)}
          onClose={() => setLightbox({ index: -1, id: null })}
        />
      ) : null}
      {lightbox.id !== null && lightbox.kind === "video" ? (
        <VideoLightbox video={videos[Math.max(0, lightbox.index)]} onClose={() => setLightbox({ index: -1, id: null })} />
      ) : null}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded-md bg-background/80 p-1 text-destructive" title="Delete">
      <Trash2 className="size-3.5" />
    </button>
  );
}

function PhotoCard({
  media,
  onOpen,
  onDelete,
  onSetCover,
  onMoveLeft,
  onMoveRight,
  onCaption,
}: {
  media: MediaRow;
  onOpen: () => void;
  onDelete?: (() => void) | undefined;
  onSetCover?: (() => void) | undefined;
  onMoveLeft?: (() => void) | undefined;
  onMoveRight?: (() => void) | undefined;
  onCaption?: ((v: string) => void | Promise<void>) | undefined;
}) {
  const { data: url } = useQuery({
    queryKey: ["media-url", media.id, media.thumbnail_path ?? media.storage_path],
    queryFn: () => fetchMediaUrl(media.thumbnail_path ?? media.storage_path),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="relative">
      <button onClick={onOpen} className="group relative aspect-square w-full overflow-hidden rounded-lg bg-secondary">
        {url ? <img src={url} alt={media.caption ?? ""} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></span>}
        {media.is_cover ? <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">Cover</span> : null}
      </button>
      <div className="absolute right-1 top-1 flex flex-col items-end gap-1">
        {onSetCover ? <button onClick={onSetCover} className="rounded-md bg-background/80 p-1 text-foreground" title="Set as cover"><Star className={`size-3.5 ${media.is_cover ? "fill-current" : ""}`} /></button> : null}
        {onDelete ? <DeleteButton onClick={onDelete} /> : null}
      </div>
      <div className="absolute bottom-1 left-1 flex gap-1">
        {onMoveLeft ? <button onClick={onMoveLeft} className="rounded-md bg-background/80 p-1" title="Move earlier"><ChevronLeft className="size-3.5" /></button> : null}
        {onMoveRight ? <button onClick={onMoveRight} className="rounded-md bg-background/80 p-1" title="Move later"><ChevronRight className="size-3.5" /></button> : null}
      </div>
      {onCaption ? (
        <input
          className="mt-1 w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px]"
          defaultValue={media.caption ?? ""}
          placeholder="Caption"
          onBlur={(e) => onCaption(e.target.value)}
        />
      ) : null}
    </div>
  );
}

function VideoCard({
  media,
  onOpen,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onCaption,
}: {
  media: MediaRow;
  onOpen: () => void;
  onDelete?: (() => void) | undefined;
  onMoveLeft?: (() => void) | undefined;
  onMoveRight?: (() => void) | undefined;
  onCaption?: ((v: string) => void | Promise<void>) | undefined;
}) {
  const { data: posterUrl } = useQuery({
    queryKey: ["media-poster", media.id],
    queryFn: async () => (media.poster_path ? fetchMediaUrl(media.poster_path) : null),
    staleTime: 5 * 60_000,
  });
  return (
    <div>
      <button onClick={onOpen} className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary">
        {posterUrl ? <img src={posterUrl} alt="" loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-muted-foreground"><Video className="size-6" /></span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20"><Video className="size-8 text-white" /></span>
      </button>
      <div className="flex items-center gap-2">
        {onMoveLeft ? <button onClick={onMoveLeft} className="rounded-md bg-background/80 p-1" title="Move earlier"><ChevronLeft className="size-3.5" /></button> : null}
        {onMoveRight ? <button onClick={onMoveRight} className="rounded-md bg-background/80 p-1" title="Move later"><ChevronRight className="size-3.5" /></button> : null}
      </div>
      {onCaption ? (
        <input
          className="mt-1 w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px]"
          defaultValue={media.caption ?? ""}
          placeholder="Caption"
          onBlur={(e) => onCaption(e.target.value)}
        />
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{media.caption ?? ""}</p>
      )}
      {onDelete ? <button onClick={onDelete} className="mt-1 text-xs text-destructive underline">Delete</button> : null}
    </div>
  );
}

function LightboxPhotos({ photos, startIndex, onClose }: { photos: MediaRow[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const { data: url } = useQuery({
    queryKey: ["media-full", photos[index]?.id],
    queryFn: () => fetchMediaUrl(photos[index]!.storage_path) as Promise<string>,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal>
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm">{index + 1} of {photos.length}</span>
        <button onClick={onClose} aria-label="Close"><X className="size-6" /></button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        {url ? <img src={url} alt="" className="max-h-[80vh] max-w-[95vw] object-contain" /> : <Loader2 className="size-8 animate-spin text-white" />}
      </div>
      <div className="flex justify-between p-3">
        <Button variant="secondary" size="icon" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}><ChevronLeft className="size-5" /></Button>
        <Button variant="secondary" size="icon" disabled={index >= photos.length - 1} onClick={() => setIndex((i) => i + 1)}><ChevronRight className="size-5" /></Button>
      </div>
    </div>
  );
}

function VideoLightbox({ video, onClose }: { video?: MediaRow | undefined; onClose: () => void }) {
  const { data: src } = useQuery({
    queryKey: ["media-video", video?.id],
    queryFn: async () => (video ? fetchMediaUrl(video.storage_path) : null),
    staleTime: 5 * 60_000,
  });
  const { data: poster } = useQuery({
    queryKey: ["media-video-poster", video?.id],
    queryFn: async () => (video?.poster_path ? fetchMediaUrl(video.poster_path) : null),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4" role="dialog" aria-modal>
      <button onClick={onClose} className="absolute right-4 top-4 text-white" aria-label="Close"><X className="size-7" /></button>
      {src ? (
        <video src={src} poster={poster ?? undefined} controls autoPlay playsInline className="max-h-[85vh] max-w-[95vw]" />
      ) : (
        <Loader2 className="size-8 animate-spin text-white" />
      )}
    </div>
  );
}
