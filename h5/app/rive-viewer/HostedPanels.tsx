import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../../lib/clipboard";
import { formatCommentAbsoluteDate, formatCommentDate } from "../../lib/comment-time";
import { formatCommentTimeline, parseCommentTimeline } from "../../lib/comment-timeline";
import { formatBytes } from "../../lib/library";
import type { HostedComment, HostedShare } from "../../lib/hosted-api";
import { publicAssetUrl } from "../../lib/public-base";
import { hostedSharePath, hostedShareUrl } from "../../lib/viewer-route";
import { Icon } from "./Icon";

function CommentBody({
  body,
  timelines,
  onSelectTimeline,
}: {
  body: string;
  timelines: string[];
  onSelectTimeline: (name: string) => void;
}) {
  const parsed = parseCommentTimeline(body);
  if (!parsed.timelineName) return <p>{body}</p>;
  const available = timelines.includes(parsed.timelineName);
  return (
    <p className="comment-body">
      <button
        className="comment-timeline-link"
        type="button"
        disabled={!available}
        title={available ? `切换到时间轴 ${parsed.timelineName}` : `当前文件中没有时间轴 ${parsed.timelineName}`}
        onPointerUp={(event) => event.currentTarget.blur()}
        onClick={() => onSelectTimeline(parsed.timelineName)}
      >
        {parsed.timelineName}
      </button>
      {parsed.body && <span> {parsed.body}</span>}
    </p>
  );
}

export function ArchivedLibraryDialog({
  archivedItems,
  loading,
  error,
  busyCode,
  onRefresh,
  onRestore,
  onClose,
}: {
  archivedItems: HostedShare[];
  loading: boolean;
  error: string;
  busyCode: string;
  onRefresh: () => void;
  onRestore: (share: HostedShare) => Promise<void>;
  onClose: () => void;
}) {
  const [copyNotice, setCopyNotice] = useState("");
  const noticeTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleDialogKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const showCopyNotice = (message: string) => {
    setCopyNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setCopyNotice(""), 2200);
  };

  const copyShare = async (share: HostedShare) => {
    try {
      await copyText(hostedShareUrl(share.code));
      showCopyNotice(`链接 ${share.code} 已复制`);
    } catch {
      showCopyNotice("复制失败，请打开链接后手动复制地址");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onCloseRef.current();
    }}>
      <div
        ref={dialogRef}
        id="archived-library-dialog"
        className="archived-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="archived-library-title"
        aria-describedby="archived-library-description"
      >
        <button
          ref={closeButtonRef}
          className="dialog-close"
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label="关闭已归档文件"
        >
          <Icon name="x" size={19} />
        </button>
        <h2 id="archived-library-title">已归档文件</h2>
        <p id="archived-library-description">恢复后原来的公开链接会继续生效。</p>
        <div className="archived-dialog-toolbar">
          <span>{archivedItems.length} 个文件</span>
        <button
          className="hosted-refresh press-feedback"
          type="button"
          onClick={onRefresh}
          disabled={loading}
        >
          <Icon name="arrow-counter-clockwise" size={16} />
          <span>刷新</span>
        </button>
        </div>

      {copyNotice && <div className="hosted-notice" role="status" aria-live="polite">{copyNotice}</div>}
      {error && (
        <div className="hosted-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRefresh}>重试</button>
        </div>
      )}

        <div className="archived-dialog-body">
          {loading ? (
            <div className="hosted-skeleton" aria-label="正在读取托管文件">
              <span /><span /><span />
            </div>
          ) : archivedItems.length ? (
            <div className="hosted-list">
              {archivedItems.map((share) => (
                <article className="hosted-row" key={share.code}>
                  <a className="hosted-open press-feedback-large" href={hostedSharePath(share.code)}>
                    <span className="hosted-code">{share.code}</span>
                    <span className="hosted-copy">
                      <strong>{share.filename}</strong>
                      <small>
                        {formatBytes(share.size)} / {share.commentCount} 条评论
                      </small>
                      <span>
                        归档于 {formatCommentAbsoluteDate(share.archivedAt)}
                      </span>
                    </span>
                  </a>
                  <div className="hosted-actions">
                    <button
                      className="press-feedback"
                      type="button"
                      onClick={() => copyShare(share)}
                      aria-label={`复制 ${share.filename} 的公开链接`}
                      title="复制公开链接"
                    >
                      <Icon name="copy-simple" size={17} />
                    </button>
                    <button
                      className="press-feedback hosted-restore"
                      type="button"
                      onClick={() => onRestore(share)}
                      disabled={busyCode === share.code}
                      aria-label={`恢复 ${share.filename}`}
                      title="恢复"
                    >
                      <Icon name="arrow-counter-clockwise" size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="hosted-empty">
              <Icon name="archive" size={22} />
              <strong>没有已归档文件</strong>
              <span>归档后的文件会保留原链接，并显示在这里。</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArchiveConfirmDialog({
  share,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  share: HostedShare;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-dialog-title">
        <span className="dialog-icon"><Icon name="archive" size={22} /></span>
        <h2 id="archive-dialog-title">归档这个文件？</h2>
        <p>公开链接会保留，但文件将停止播放和评论。之后可以恢复。</p>
        <strong>{share.filename}</strong>
        {error && <div className="archive-dialog-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button className="archive-confirm" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "正在归档" : "确认归档"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareActionsDialog({
  dialogId,
  share,
  onDownload,
  onClose,
}: {
  dialogId: string;
  share: Pick<HostedShare, "code" | "filename">;
  onDownload: () => void | Promise<void>;
  onClose: () => void;
}) {
  const url = useMemo(() => hostedShareUrl(share.code), [share.code]);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => copyButtonRef.current?.focus());
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleDialogKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const copy = async () => {
    try {
      await copyText(url);
      setNotice("链接已复制");
    } catch {
      setNotice("复制失败，请手动选择链接复制");
    }
  };

  const download = async () => {
    try {
      await onDownload();
      onCloseRef.current();
    } catch {
      setNotice("下载失败，请稍后重试");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onCloseRef.current();
    }}>
      <div
        ref={dialogRef}
        id={dialogId}
        className="share-link-dialog share-actions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
      >
        <button className="dialog-close" type="button" onClick={() => onCloseRef.current()} aria-label="关闭">
          <Icon name="x" size={19} />
        </button>
        <h2 id={`${dialogId}-title`}>分享文件</h2>
        <div className="share-action-stack">
          <div className="share-link-option">
            <span className="share-action-label">公开链接</span>
            <div className="share-link-row">
              <output className="share-link-value" title={url}>{url}</output>
              <button
                ref={copyButtonRef}
                className="share-copy-action press-feedback"
                type="button"
                onClick={() => void copy()}
                aria-label="复制公开链接"
                title="复制公开链接"
              >
                <Icon name={notice === "链接已复制" ? "cloud-check" : "copy-simple"} size={18} />
              </button>
            </div>
          </div>
          <button
            className="share-download-action press-feedback"
            type="button"
            onClick={() => void download()}
            title={`下载 ${share.filename}`}
          >
            <Icon name="download-simple" size={19} />
            <span>下载</span>
          </button>
        </div>
        {notice && <div className="dialog-notice" role="status" aria-live="polite">{notice}</div>}
      </div>
    </div>
  );
}

export function PublishConfirmDialog({
  filename,
  progress,
  error,
  onCancel,
  onConfirm,
}: {
  filename: string;
  progress: number | null;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const uploading = progress !== null;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, uploading]);

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !uploading) onCancel();
    }}>
      <div className="confirm-dialog publish-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title">
        <span className="dialog-icon"><Icon name="link-simple" size={22} /></span>
        <h2 id="publish-dialog-title">生成公开链接？</h2>
        <p>知道链接的人都可以查看和评论，也可以继续转发这个链接。</p>
        <strong>{filename}</strong>
        {uploading && (
          <div className="publish-progress" role="progressbar" aria-label="上传进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span><i style={{ width: `${progress}%` }} /></span>
            <b>{progress}%</b>
          </div>
        )}
        {error && <div className="dialog-notice is-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={uploading}>取消</button>
          <button className="primary-action" type="button" onClick={onConfirm} disabled={uploading}>
            {uploading ? `正在上传 ${progress}%` : error ? "重新上传" : "确认生成"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareCommentsPanel({
  comments,
  loading,
  loadError,
  submitError,
  submitting,
  actionBusyId,
  actionError,
  timelines,
  activeTimeline,
  onRetry,
  onSubmit,
  onArchive,
  onRestore,
  onSelectTimeline,
}: {
  comments: HostedComment[];
  loading: boolean;
  loadError: string;
  submitError: string;
  submitting: boolean;
  actionBusyId: string;
  actionError: string;
  timelines: string[];
  activeTimeline: string;
  onRetry: () => void;
  onSubmit: (body: string) => Promise<boolean>;
  onArchive: (comment: HostedComment) => Promise<void>;
  onRestore: (comment: HostedComment) => Promise<void>;
  onSelectTimeline: (name: string) => void;
}) {
  const [body, setBody] = useState("");
  const [draftTimeline, setDraftTimeline] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const serializedBody = `${formatCommentTimeline(draftTimeline)}${body.trim()}`;
    const submittedBody = Array.from(serializedBody).slice(0, 1000).join("").trim();
    if (!submittedBody || submitting) return;
    setSubmitNotice("");
    const created = await onSubmit(submittedBody);
    if (created) {
      setBody("");
      setDraftTimeline("");
      setSubmitNotice("评论已发表");
    }
  };

  return (
    <section className="comments-panel" aria-label="评论与备注">
      <div className="comments-heading">
        <h2>评论与备注</h2>
        <span>{comments.length}</span>
      </div>

      <form className="comment-form" onSubmit={submit}>
        <label>
          <span className="sr-only">评论内容</span>
          {draftTimeline && <span className="comment-draft-timeline">{draftTimeline}</span>}
          <textarea
            value={body}
            rows={1}
            onFocus={() => {
              setDraftTimeline((current) => current || activeTimeline);
              setSubmitNotice("");
            }}
            onChange={(event) => {
              setBody(Array.from(event.target.value).slice(0, 1000).join(""));
              setSubmitNotice("");
            }}
            placeholder="写下评论或备注"
            disabled={submitting}
          />
        </label>
        <div className="comment-submit-row">
          <button className="primary-action press-feedback" type="submit" disabled={(!body.trim() && !draftTimeline) || submitting}>
            {submitting ? "正在提交" : submitError ? "重新发表" : "发表评论"}
          </button>
        </div>
      </form>
      {submitNotice && (
        <div className="comment-submit-notice" role="status" aria-live="polite">{submitNotice}</div>
      )}

      {submitError && (
        <div className="comments-error comment-submit-error" role="alert">
          <span>{submitError}，正文已保留，请重新发表。</span>
        </div>
      )}

      {loadError && (
        <div className="comments-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={onRetry}>重新读取评论</button>
        </div>
      )}

      {actionError && (
        <div className="comments-error comment-action-error" role="alert">
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="comments-skeleton" role="status" aria-label="正在读取评论"><span /><span /></div>
      ) : loadError ? null : comments.length ? (
        <div className="comment-list">
          {comments.map((comment) => comment.status === "archived" ? (
            <details className="comment-item comment-item-archived" key={comment.id}>
              <summary>
                <span className="comment-author">
                  <img
                    src={publicAssetUrl(`avatars/${comment.avatar}.webp`)}
                    width="32"
                    height="32"
                    alt=""
                  />
                  <strong>{comment.nickname}</strong>
                </span>
                <span className="comment-archived-label">评论已归档</span>
              </summary>
              <div className="comment-archived-content">
                <div className="comment-meta-row">
                  <time
                    dateTime={comment.createdAt}
                    title={formatCommentAbsoluteDate(comment.createdAt)}
                  >
                    {formatCommentDate(comment.createdAt)}
                  </time>
                  <button
                    type="button"
                    disabled={Boolean(actionBusyId)}
                    onClick={() => onRestore(comment)}
                  >
                    {actionBusyId === comment.id ? "恢复中" : "恢复"}
                  </button>
                </div>
                <CommentBody
                  body={comment.body}
                  timelines={timelines}
                  onSelectTimeline={onSelectTimeline}
                />
              </div>
            </details>
          ) : (
            <article className="comment-item" key={comment.id}>
              <img
                className="comment-avatar"
                src={publicAssetUrl(`avatars/${comment.avatar}.webp`)}
                width="32"
                height="32"
                alt=""
              />
              <div className="comment-content">
                <header>
                  <strong className="comment-nickname">{comment.nickname}</strong>
                  <span className="comment-meta-row">
                    <time
                      dateTime={comment.createdAt}
                      title={formatCommentAbsoluteDate(comment.createdAt)}
                    >
                      {formatCommentDate(comment.createdAt)}
                    </time>
                    <button
                      className="comment-archive-action"
                      type="button"
                      disabled={Boolean(actionBusyId)}
                      onClick={() => onArchive(comment)}
                    >
                      {actionBusyId === comment.id ? "归档中" : "归档"}
                    </button>
                  </span>
                </header>
                <CommentBody
                  body={comment.body}
                  timelines={timelines}
                  onSelectTimeline={onSelectTimeline}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="comments-empty">
          <Icon name="chat-circle-dots" size={20} />
          <span>还没有评论，留下第一条备注。</span>
        </div>
      )}
    </section>
  );
}

export function PublicShareState({
  kind,
  title,
  message,
  progress,
  progressLabel,
  onRetry,
  homeHref,
}: {
  kind: "loading" | "error" | "archived";
  title: string;
  message: string;
  progress?: number;
  progressLabel?: string;
  onRetry?: () => void;
  homeHref: string;
}) {
  return (
    <section
      className={`public-share-state is-${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <span className="public-state-icon">
        <Icon name={kind === "archived" ? "archive" : kind === "error" ? "x" : "link-simple"} size={26} />
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
      {kind === "loading" && typeof progress === "number" && (
        <div
          className="public-download-progress"
          role="progressbar"
          aria-label={progressLabel || "公开文件下载进度"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span className="public-download-copy">
            <strong>{progress}%</strong>
            <small>{progressLabel || "正在下载公开文件"}</small>
          </span>
          <span className="public-download-track">
            <span className="public-download-fill" style={{ width: `${progress}%` }} />
          </span>
        </div>
      )}
      <div className="public-state-actions">
        {onRetry && <button className="primary-action" type="button" onClick={onRetry}>重新加载</button>}
        <a href={homeHref}>返回预览台</a>
      </div>
    </section>
  );
}
