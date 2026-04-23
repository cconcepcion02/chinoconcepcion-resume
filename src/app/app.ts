import { Component, computed, effect, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked } from 'marked';
import { siteConfig } from './site-config';

type SkillCard = {
  kicker: string;
  title: string;
  body: string;
};

type TrustedLogo = {
  name: string;
  mark: string;
};

type ChatMessage = {
  role: 'assistant' | 'user';
  text: string;
  html: string;
  attachments?: AttachmentPreview[];
};

type AttachmentKind = 'image' | 'audio' | 'file';

type AttachmentPreview = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: AttachmentKind;
  previewUrl?: string;
  content?: string;
};

type ChatApiResponse = {
  reply?: string;
  model?: string;
  error?: string;
  code?: string;
  details?: string;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '[class.light-theme]': 'lightTheme()'
  }
})
export class App implements OnDestroy {
  protected readonly chatEnabled = siteConfig.chatEnabled;
  protected readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  protected readonly trustedLogos: TrustedLogo[] = [
    { name: 'Your Company', mark: 'YC' },
    { name: 'Client Brand', mark: 'CB' },
    { name: 'Partner Group', mark: 'PG' },
    { name: 'Product Team', mark: 'PT' },
    { name: 'Startup Lab', mark: 'SL' },
    { name: 'Enterprise Co', mark: 'EC' }
  ];
  protected readonly cards: SkillCard[] = [
    {
      kicker: '01 • Frontend Engineering',
      title: 'Product-focused interfaces built for clarity and scale',
      body:
        'Builds Angular and React applications with structured components, clean state management, and responsive interaction patterns that stay maintainable as products grow.'
    },
    {
      kicker: '02 • Backend Systems',
      title: 'Reliable service layers with practical architecture',
      body:
        'Delivers backend services in Python, PHP, and Node.js with strong attention to modular business logic, API design, and long-term maintainability.'
    },
    {
      kicker: '03 • Data Architecture',
      title: 'Database design that supports performance and operations',
      body:
        'Designs relational data models in MySQL, MariaDB, and PostgreSQL with an emphasis on schema discipline, query efficiency, and dependable day-to-day operation.'
    },
    {
      kicker: '04 • Platform Delivery',
      title: 'Deployment-ready services and automation workflows',
      body:
        'Uses Docker, workflow automation, and API-first delivery to move projects from development to deployment with fewer handoff issues and cleaner scaling paths.'
    },
    {
      kicker: '05 • Applied AI',
      title: 'AI features designed for business use, not demos',
      body:
        'Implements OpenAI and Gemini integrations for assistants, workflow automation, and operational tooling that solve real product and process needs.'
    },
    {
      kicker: '06 • Engineering Approach',
      title: 'Scalable systems with clean separation of concerns',
      body:
        'Builds modular services, microservice-ready platforms, and gateway-based architectures that remain understandable to teams and adaptable to change.'
    },
    {
      kicker: '07 • Delivery Standard',
      title: 'Production-minded execution from UI to infrastructure',
      body:
        'Works with a production mindset across the stack, combining clean architecture, thoughtful interface work, and deployment discipline into one delivery standard.'
    },
    {
      kicker: '08 • Business Integrations',
      title: 'Third-party integrations handled with accountability',
      body:
        'Integrates payments, messaging, notifications, and identity providers such as Stripe, Twilio, OneSignal, and Microsoft Sign-In with reliability and maintainability in mind.'
    }
  ];

  protected readonly activeIndex = signal(0);
  protected readonly viewportWidth = signal(
    typeof window === 'undefined' ? 1280 : Math.max(window.innerWidth, 300)
  );
  protected readonly chatOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly lightTheme = signal(false);
  protected readonly draftMessage = signal('');
  protected readonly chatBusy = signal(false);
  protected readonly recording = signal(false);
  protected readonly chatStatus = signal(
    this.chatEnabled ? 'Ask about projects, stack, or hiring fit' : 'Assistant disabled in static Apache build'
  );
  protected readonly attachments = signal<AttachmentPreview[]>([]);
  protected readonly messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: this.chatEnabled
        ? 'Welcome. Here are a few things you can ask:\n\n- Summarize Chino Concepcion in one paragraph\n- What stack and tools does he use?\n- Why would he be a strong full-stack hire?\n- Show examples of backend, AI, and integration work'
        : 'This Apache package is running in static mode. The portfolio is available, but the AI assistant is disabled because no local API is included.',
      html: this.renderMarkdown(
        this.chatEnabled
          ? 'Welcome. Here are a few things you can ask:\n\n- Summarize Chino Concepcion in one paragraph\n- What stack and tools does he use?\n- Why would he be a strong full-stack hire?\n- Show examples of backend, AI, and integration work'
          : 'This Apache package is running in static mode. The portfolio is available, but the AI assistant is disabled because no local API is included.'
      )
    }
  ]);

  protected readonly activeCard = computed(() => this.cards[this.activeIndex()]);
  protected readonly compactViewport = computed(() => this.viewportWidth() <= 760);

  private autoRotateId: number | null = null;
  private autoRotateResumeId: number | null = null;
  private readonly handleResize = () => {
    this.viewportWidth.set(Math.max(window.innerWidth, 300));
  };

  constructor() {
    effect(() => {
      this.messages();
      this.chatBusy();
      this.chatOpen();
      queueMicrotask(() => this.scrollMessagesToBottom());
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize, { passive: true });
      this.startAutoRotate();
    }
  }

  ngOnDestroy(): void {
    if (this.autoRotateId) {
      window.clearInterval(this.autoRotateId);
    }
    if (this.autoRotateResumeId) {
      window.clearTimeout(this.autoRotateResumeId);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
    }
  }

  protected prevCard(): void {
    this.setActiveCard(this.activeIndex() - 1, true);
  }

  protected nextCard(): void {
    this.setActiveCard(this.activeIndex() + 1, true);
  }

  protected goToCard(index: number): void {
    this.setActiveCard(index, true);
  }

  protected getCardStyle(index: number): Record<string, string | number> {
    const offset = this.getCircularOffset(index);
    const depth = Math.abs(offset);

    if (this.compactViewport()) {
      const isActive = depth === 0;

      return {
        transform: isActive ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, 18px, -80px) scale(0.94)',
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 20 : 0,
        filter: isActive ? 'blur(0) saturate(1.05)' : 'blur(0)',
        pointerEvents: isActive ? 'auto' : 'none'
      };
    }

    const hidden = depth > 3;
    const translateX = offset * 23;
    const translateY = depth === 0 ? 0 : depth * 18;
    const translateZ = depth === 0 ? 120 : 120 - depth * 60;
    const rotateY = offset * -30;
    const scale = depth === 0 ? 1 : Math.max(0.72, 1 - depth * 0.12);
    const blur = Math.max(0, depth - 1) * 0.7;

    return {
      transform: hidden
        ? 'translate3d(0, 36px, -180px) scale(0.66)'
        : `translate3d(${translateX}%, ${translateY}px, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity: hidden ? 0 : Math.max(0.18, 1 - depth * 0.24),
      zIndex: hidden ? 0 : 30 - depth,
      filter: `blur(${blur}px) saturate(${depth === 0 ? 1.1 : 0.92})`,
      pointerEvents: depth === 0 ? 'auto' : 'none'
    };
  }

  protected isActiveCard(index: number): boolean {
    return this.activeIndex() === index;
  }

  protected toggleChat(): void {
    try {
      this.chatOpen.update((open) => !open);
    } catch (error) {
      this.handleUnexpectedError('Unable to toggle the chat window.', error);
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected toggleTheme(): void {
    this.lightTheme.update((enabled) => !enabled);
  }

  protected updateDraft(event: Event): void {
    try {
      const value = (event.target as HTMLTextAreaElement | null)?.value ?? '';
      this.draftMessage.set(value);
    } catch (error) {
      this.handleUnexpectedError('Unable to update the message draft.', error);
    }
  }

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  protected async handleAttachmentSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    try {
      if (!this.chatEnabled) {
        return;
      }

      const files = Array.from(input?.files || []);
      if (files.length === 0) {
        return;
      }

      await this.addFilesAsAttachments(files);
      this.chatOpen.set(true);
      this.chatStatus.set(`${files.length} attachment${files.length > 1 ? 's' : ''} ready`);
    } catch (error) {
      this.handleUnexpectedError('Unable to attach the selected files.', error);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  protected async handleAudioSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    try {
      if (!this.chatEnabled) {
        return;
      }

      const files = Array.from(input?.files || []);
      if (files.length === 0) {
        return;
      }

      await this.addFilesAsAttachments(files);
      this.chatOpen.set(true);
      this.chatStatus.set(`${files.length} audio attachment${files.length > 1 ? 's' : ''} ready`);
    } catch (error) {
      this.handleUnexpectedError('Unable to attach the selected audio file.', error);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  protected removeAttachment(id: string): void {
    try {
      this.attachments.update((attachments) => {
        const removed = attachments.find((attachment) => attachment.id === id);
        if (removed?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(removed.previewUrl);
        }
        return attachments.filter((attachment) => attachment.id !== id);
      });
      this.chatStatus.set(this.attachments().length ? 'Attachments updated' : 'Ask about projects, stack, or hiring fit');
    } catch (error) {
      this.handleUnexpectedError('Unable to remove the attachment.', error);
    }
  }

  protected attachmentTrackBy(index: number, attachment: AttachmentPreview): string {
    return `${attachment.id}-${index}`;
  }

  protected cardTrackBy(index: number, card: SkillCard): string {
    return `${card.title}-${index}`;
  }

  protected async toggleRecording(): Promise<void> {
    try {
      if (!this.chatEnabled) {
        return;
      }

      if (this.recording()) {
        this.mediaRecorder?.stop();
        this.chatStatus.set('Finalizing audio…');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Microphone recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      });

      this.mediaRecorder.addEventListener('stop', async () => {
        try {
          const finalMimeType = this.mediaRecorder?.mimeType || mimeType || 'audio/webm';
          const extension = finalMimeType.includes('mp4') ? 'm4a' : 'webm';
          const blob = new Blob(this.recordedChunks, { type: finalMimeType });

          if (!blob.size) {
            throw new Error('No audio was captured.');
          }

          const file = new File([blob], `voice-message-${Date.now()}.${extension}`, {
            type: finalMimeType
          });

          await this.addFilesAsAttachments([file]);
          this.chatOpen.set(true);
          this.chatStatus.set('Voice message ready');
        } catch (error) {
          this.handleUnexpectedError('Unable to process the recorded audio.', error);
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          this.recording.set(false);
          this.mediaRecorder = null;
          this.recordedChunks = [];
        }
      });

      this.mediaRecorder.addEventListener('error', (event) => {
        this.handleUnexpectedError(
          'Microphone recording failed.',
          event instanceof ErrorEvent ? event.error ?? new Error(event.message) : event
        );
        stream.getTracks().forEach((track) => track.stop());
        this.recording.set(false);
        this.mediaRecorder = null;
        this.recordedChunks = [];
      });

      this.mediaRecorder.start();
      this.recording.set(true);
      this.chatOpen.set(true);
      this.chatStatus.set('Recording audio…');
    } catch (error) {
      this.handleUnexpectedError('Microphone access failed.', error);
    }
  }

  protected renderMarkdown(text: string): string {
    try {
      return marked.parse(text, {
        breaks: true,
        gfm: true
      }) as string;
    } catch {
      const escaped = text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
      return `<p>${escaped}</p>`;
    }
  }

  private scrollMessagesToBottom(): void {
    const container = this.messagesContainer()?.nativeElement;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  private async addFilesAsAttachments(files: File[]): Promise<void> {
    try {
      if (!files.length) {
        return;
      }

      const nextAttachments = await Promise.all(files.map((file) => this.createAttachmentPreview(file)));
      this.attachments.update((attachments) => [...attachments, ...nextAttachments]);
    } catch (error) {
      throw this.normalizeError(error, 'Unable to prepare the selected attachment.');
    }
  }

  private async createAttachmentPreview(file: File): Promise<AttachmentPreview> {
    try {
      if (!file || !file.size) {
        throw new Error(`The selected file ${file?.name || ''} is empty.`);
      }

      const kind: AttachmentKind = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'file';

      const attachment: AttachmentPreview = {
        id: `${Date.now()}-${crypto.randomUUID()}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        kind
      };

      if (kind === 'image') {
        attachment.content = await this.readFileAsDataUrl(file);
        attachment.previewUrl = attachment.content;
      } else if (kind === 'audio') {
        attachment.content = await this.readFileAsDataUrl(file);
        attachment.previewUrl = URL.createObjectURL(file);
      } else {
        attachment.content = await this.readFileAsDataUrl(file);
      }

      return attachment;
    } catch (error) {
      throw this.normalizeError(error, `Unable to process ${file?.name || 'the selected file'}.`);
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result) {
            reject(new Error(`Unable to read file: ${file.name}`));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error(`Unable to read file: ${file.name}`));
        reader.readAsDataURL(file);
      } catch (error) {
        reject(this.normalizeError(error, `Unable to read file: ${file.name}`));
      }
    });
  }

  protected async sendMessage(): Promise<void> {
    try {
      if (!this.chatEnabled) {
        this.chatOpen.set(true);
        this.chatStatus.set('Assistant disabled in static Apache build');
        return;
      }

      const nextMessage = this.draftMessage().trim();
      const pendingAttachments = [...this.attachments()];
      if ((!nextMessage && pendingAttachments.length === 0) || this.chatBusy()) {
        return;
      }

      this.messages.update((messages) => [
        ...messages,
        {
          role: 'user',
          text: nextMessage || 'Sent an attachment',
          html: this.renderMarkdown(nextMessage || 'Sent an attachment'),
          attachments: pendingAttachments
        }
      ]);
      this.draftMessage.set('');
      this.attachments.set([]);
      this.chatOpen.set(true);
      this.chatBusy.set(true);
      this.chatStatus.set('Preparing a response…');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: nextMessage,
          attachments: pendingAttachments.map((attachment) => ({
            kind: attachment.kind,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            content: attachment.content
              ? attachment.content.replace(/^data:[^;]+;base64,/, '')
              : undefined
          }))
        })
      });

      const data = (await this.safeParseJson(response)) as ChatApiResponse;
      if (!response.ok) {
        throw this.buildChatApiError(response.status, data);
      }

      const reply =
        typeof data.reply === 'string' && data.reply.trim()
          ? data.reply
          : 'The local AI bridge did not return a valid response.';

      this.pushAssistantMessage(reply);
      this.chatStatus.set('Ask another question or send an attachment');
    } catch (error) {
      this.handleChatRequestError(error);
    } finally {
      this.chatBusy.set(false);
    }
  }

  protected handleComposerKeydown(event: KeyboardEvent): void {
    try {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.sendMessage();
      }
    } catch (error) {
      this.handleUnexpectedError('Unable to handle the keyboard shortcut.', error);
    }
  }

  private pushAssistantMessage(text: string): void {
    this.messages.update((messages) => [
      ...messages,
      {
        role: 'assistant',
        text,
        html: this.renderMarkdown(text)
      }
    ]);
  }

  private safeParseJson(response: Response): Promise<unknown> {
    return response
      .text()
      .then((raw) => {
        const trimmed = raw.trim();
        if (!trimmed) {
          return {};
        }

        try {
          return JSON.parse(trimmed);
        } catch {
          const looksLikeHtml = /<!doctype html>|<html[\s>]/i.test(trimmed);
          return {
            error: looksLikeHtml
              ? 'The chat API returned HTML instead of JSON. Make sure the local API server is running and the frontend is proxying `/api` correctly.'
              : 'The chat API returned an unexpected non-JSON response.',
            code: 'INVALID_SERVER_RESPONSE',
            details: trimmed.slice(0, 280)
          };
        }
      })
      .catch(() => ({
        error: 'The chat API response could not be read.',
        code: 'CHAT_RESPONSE_READ_ERROR'
      }));
  }

  private buildChatApiError(status: number, data: ChatApiResponse): Error {
    const code = typeof data.code === 'string' ? data.code : 'CHAT_API_ERROR';
    const details = [data.error, data.details].filter((value) => typeof value === 'string' && value.trim()).join(' ');
    const error = new Error(details || `Chat request failed with status ${status}.`) as Error & {
      status?: number;
      code?: string;
    };
    error.status = status;
    error.code = code;
    return error;
  }

  private handleChatRequestError(error: unknown): void {
    const normalized = this.normalizeError(error, 'The local AI bridge request failed.');
    const errorCode = (normalized as Error & { code?: string }).code;

    if (errorCode === 'OLLAMA_CREDIT_LIMIT') {
      this.chatStatus.set('Assistant limit reached');
      this.pushAssistantMessage(
        'The current assistant service hit its credit or quota limit. Try again later or switch to another configured model.'
      );
      return;
    }

    if (errorCode === 'OLLAMA_RATE_LIMIT') {
      this.chatStatus.set('Assistant is rate-limited');
      this.pushAssistantMessage('The assistant is being rate-limited right now. Wait a moment and try again.');
      return;
    }

    if (errorCode === 'OLLAMA_UNAVAILABLE') {
      this.chatStatus.set('Assistant unavailable');
      this.pushAssistantMessage(
        'The assistant service is unavailable right now. Check that the configured local model service is running and reachable.'
      );
      return;
    }

    if (errorCode === 'INVALID_SERVER_RESPONSE' || errorCode === 'CHAT_RESPONSE_READ_ERROR') {
      this.chatStatus.set('Assistant unavailable');
      this.pushAssistantMessage(
        'The chat endpoint returned an unexpected response. Start the local API server and confirm `/api/chat` is reachable from the frontend.'
      );
      return;
    }

    this.chatStatus.set('Chat error');
    this.pushAssistantMessage(normalized.message);
  }

  private handleUnexpectedError(context: string, error: unknown): void {
    const normalized = this.normalizeError(error, context);
    this.chatOpen.set(true);
    this.chatStatus.set('Action failed');
    this.pushAssistantMessage(normalized.message);
  }

  private normalizeError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) {
      return new Error(error.message || fallbackMessage);
    }

    if (typeof error === 'string' && error.trim()) {
      return new Error(error);
    }

    return new Error(fallbackMessage);
  }

  private setActiveCard(index: number, pauseAutoRotate: boolean): void {
    const total = this.cards.length;
    const normalized = ((index % total) + total) % total;
    this.activeIndex.set(normalized);

    if (pauseAutoRotate) {
      this.pauseAutoRotate();
    }
  }

  private getCircularOffset(index: number): number {
    const total = this.cards.length;
    let offset = index - this.activeIndex();
    if (offset > total / 2) {
      offset -= total;
    }
    if (offset < -total / 2) {
      offset += total;
    }
    return offset;
  }

  private startAutoRotate(): void {
    if (this.autoRotateId) {
      window.clearInterval(this.autoRotateId);
    }

    this.autoRotateId = window.setInterval(() => {
      this.setActiveCard(this.activeIndex() + 1, false);
    }, 3600);
  }

  private pauseAutoRotate(): void {
    if (this.autoRotateId) {
      window.clearInterval(this.autoRotateId);
      this.autoRotateId = null;
    }

    if (this.autoRotateResumeId) {
      window.clearTimeout(this.autoRotateResumeId);
    }

    this.autoRotateResumeId = window.setTimeout(() => {
      this.startAutoRotate();
    }, 9000);
  }
}
