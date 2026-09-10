import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContinueButton } from "./continue-button";

const mocks = vi.hoisted(() => ({advance: vi.fn(), toast: vi.fn()}));
vi.mock("@/lib/actions", () => ({continueWeek: mocks.advance}));
vi.mock("@/components/toaster", () => ({useToast: () => ({toast:mocks.toast})}));

const week = (revision:number, decisions:string[] = []) => ({state:{revision,pending_actions:decisions.length,game_over:false},open_decision_ids:decisions,notable:[]});
beforeEach(() => {mocks.advance.mockReset();mocks.toast.mockReset();});
describe("weekly advancement", () => {
 it("does not submit a second tick while the first is in flight", async () => {
   let finish = (_value:ReturnType<typeof week>) => {};
   mocks.advance.mockReturnValue(new Promise(resolve => {finish=resolve;}));
   render(<ContinueButton pending={0} revision={4} variant="rail"/>);
   const button=screen.getByRole('button',{name:'Continue to next week'});
   fireEvent.click(button);fireEvent.click(button);
   expect(mocks.advance).toHaveBeenCalledTimes(1);
   await act(async()=>finish(week(5)));
   expect(button).toBeEnabled();
 });
 it("stops automatic play at a newly actionable decision", async () => {
   mocks.advance.mockResolvedValue(week(5,['new-story']));
   render(<ContinueButton pending={0} revision={4} variant="rail"/>);
   fireEvent.click(screen.getByRole('button',{name:'To next event'}));
   await waitFor(()=>expect(screen.getByRole('button',{name:'Continue to next week'})).toBeEnabled());
   expect(mocks.advance).toHaveBeenCalledTimes(1);
 });
 it("cancels between weeks without queuing an extra request", async () => {
   let finish = (_value:ReturnType<typeof week>) => {};
   mocks.advance.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
   render(<ContinueButton pending={0} revision={4} variant="rail"/>);
   fireEvent.click(screen.getByRole('button',{name:'To next event'}));
   fireEvent.click(screen.getByRole('button',{name:'Stop advancing'}));
   await act(async()=>finish(week(5)));
   expect(mocks.advance).toHaveBeenCalledTimes(1);
 });
});
