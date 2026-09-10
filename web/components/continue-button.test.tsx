import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContinueButton } from "./continue-button";

const mocks = vi.hoisted(() => ({advance: vi.fn(), toast: vi.fn()}));
vi.mock("@/lib/actions", () => ({continueWeek: mocks.advance}));
vi.mock("@/components/toaster", () => ({useToast: () => ({toast:mocks.toast})}));

const week = (revision:number, decisions:string[] = []) => ({state:{revision,pending_actions:decisions.length,game_over:false},open_decision_ids:decisions,notable:[]});
const storyDecision = {id:"story-1",kind:"career.story" as const,severity:"action" as const,headline:"A client conversation",detail:"The client is waiting.",player_id:7,interest_id:null,weeks_left:null,actionable:true,blocked_reason:"",href:"/careers",extra:{}};
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
 it("keeps open conversations visible while skip advancement is in flight", async () => {
   let finish = (_value:ReturnType<typeof week>) => {};
   mocks.advance.mockReturnValue(new Promise(resolve => {finish=resolve;}));
   render(<ContinueButton pending={1} revision={4} decisions={[storyDecision]} variant="rail"/>);
   fireEvent.click(screen.getByRole('button',{name:'Review 1 decisions'}));
   expect(screen.getByRole('dialog')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'Skip these and advance to next event'}));
   expect(screen.getByRole('dialog')).toBeInTheDocument();
   expect(screen.getByText('A client conversation')).toBeInTheDocument();
   await act(async()=>finish({...week(5,[storyDecision.id]),state:{revision:5,pending_actions:1,game_over:true}}));
   expect(screen.getByRole('dialog')).toBeInTheDocument();
 });
});
