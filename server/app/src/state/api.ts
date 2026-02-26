import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getApiURL } from "./util";
import { normalizeServerName } from "../utils/bookUtils";

export interface IrcServer {
  elevatedUsers?: string[];
  regularUsers?: string[];
}

export interface Book {
  name: string;
  downloadLink: string;
  time: string;
}

export const openbooksApi = createApi({
  baseQuery: fetchBaseQuery({
    baseUrl: getApiURL().href,
    credentials: "include",
    mode: "cors"
  }),
  tagTypes: ["books", "servers"],
  endpoints: (builder) => ({
    getServers: builder.query<string[], null>({
      query: () => `servers`,
      transformResponse: (ircServers: IrcServer) => {
        const elevated = ircServers.elevatedUsers ?? [];
        const regular = ircServers.regularUsers ?? [];
        const deduped = new Map<string, string>();

        [...elevated, ...regular].forEach((server) => {
          const key = normalizeServerName(server);
          if (key !== "" && !deduped.has(key)) {
            deduped.set(key, server);
          }
        });

        return Array.from(deduped.values());
      },
      providesTags: ["servers"]
    }),
    getBooks: builder.query<Book[], null>({
      query: () => `library`,
      providesTags: ["books"]
    }),
    deleteBook: builder.mutation<null, string>({
      query: (book) => ({
        url: `library/${book}`,
        method: "DELETE"
      }),
      invalidatesTags: ["books"]
    })
  })
});

export const { useGetServersQuery, useGetBooksQuery, useDeleteBookMutation } =
  openbooksApi;
