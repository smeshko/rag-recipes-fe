import { useSearchParams } from "react-router";
import { type ApiError, useFavourites } from "../../api";
import { BackLink, Bloom, readReturnTo } from "../../ui";
import { FavouriteCard } from "./FavouriteCard";
import {
  FavouritesEmpty,
  FavouritesError,
  FavouritesSkeleton,
} from "./FavouriteStates";

/* /favourites — everything the reader has starred, newest star first (the
   backend orders by the STAR's timestamp, not the recipe's, so this reads as
   "what I saved recently").

   Structurally `ReviewPage` minus the filter: same Bloom cadence (head 0.06,
   list base .18 step .04), same states ladder, same countLine discipline —
   an em-dash placeholder until the list settles successfully, because an
   outage is not "0 saved".

   Same back-link guard as the queue, for the same reason: a bookmarked
   /favourites must not grow a prominent "← Back to Cook" link that dumps the
   reader on search. It renders only when a real `?from=` brought them here. */

export function FavouritesPage() {
  const [searchParams] = useSearchParams();
  const favourites = useFavourites();
  const saved = favourites.data?.knowledge_items ?? [];
  const returnTarget = readReturnTo(searchParams);

  const countLine = `${
    favourites.isSuccess ? saved.length : "—"
  } saved · the shelf you actually cook from`;

  return (
    <div>
      {returnTarget !== null && (
        <Bloom duration={0.7} delay={0.04} className="pt-8">
          <BackLink />
        </Bloom>
      )}
      {/* The back link takes the head's top padding over, so total top spacing
          stays 40px either way — ReviewPage's rule. */}
      <Bloom
        duration={0.7}
        delay={0.06}
        className={`${returnTarget === null ? "pt-10" : "pt-2"} pb-2`}
      >
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Saved for later.
        </h1>
        <div className="mt-2 text-[15px] text-fg-muted">{countLine}</div>
      </Bloom>

      <div className="mt-9">
        {favourites.isPending && <FavouritesSkeleton />}

        {favourites.isError && (
          <FavouritesError
            error={favourites.error as ApiError}
            onRetry={() => favourites.refetch()}
          />
        )}

        {favourites.isSuccess && saved.length === 0 && <FavouritesEmpty />}

        {saved.map((item, index) => (
          <Bloom
            key={item.id}
            index={index}
            base={0.18}
            step={0.04}
            className="mb-4"
          >
            <FavouriteCard item={item} />
          </Bloom>
        ))}
      </div>
    </div>
  );
}
