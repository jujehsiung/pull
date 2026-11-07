/**
 * cn() — class merge, standard shadcn shape.
 *
 * The primitives in src/components/ui/ are EVA's (MIT, @muen/eva v0.6.0), copied
 * in rather than installed as a package: the kit is not on the npm registry and
 * a `file:` dependency would break for anyone else who clones this repo. This is
 * the same copy-in model shadcn itself uses — the components are yours to edit.
 *
 * Their relative import is `../../lib/utils`, which resolves to this file, so
 * keeping the export named `cn` is load-bearing.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
