'use client';

const VenueVideo = ({ url }: { url: string }) => {
  const vimeoId = url
    .replace('https://vimeo.com/', '')
    .replace('manage/videos/', '')
    .split('?')[0];
  const [id, hash] = vimeoId.split('/');
  const src = `https://player.vimeo.com/video/${id}?api=1&autoplay=0${hash ? `&h=${hash}` : ''}`;

  if (!id) return null;

  return (
    <div className="relative flex-shrink-0 w-96 h-56 rounded-lg overflow-hidden bg-zinc-100">
      <iframe
        src={src}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Venue video"
      />
    </div>
  );
};

export { VenueVideo };
