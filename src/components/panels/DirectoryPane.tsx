import * as React from "react";
import * as ReactDOM from "react-dom";
import * as PropTypes from "prop-types";
import os from "os";
import path from "path";
import autobind from "autobind-decorator";
import { HotKeys } from "react-hotkeys";
import ScrollArea from "react-scrollbar";

import { DirectoryItem, InputItem } from "components/blocks";
import { PathPanel } from "components/panels";
import { IAppContext, IDirectoryItem, INavigationNode } from "models";
import { DirectoryManager, DirectoryTextFinder } from "objects";
import { IDirectoryPaneState } from "states/panels";
import { IDirectoryPaneProps } from "props/panels";
import { DirectoryDirection, ItemType } from "types";

import "styles/panels/DirectoryPane.scss";

/**
 * The component for displaying directory content.
 */
class DirectoryPane extends React.Component<IDirectoryPaneProps, IDirectoryPaneState> {

    /** Validation for context types. */
    public static contextTypes = {
        theme: PropTypes.object
    }

    /** The global application context. */
    public context: IAppContext;

    /** Handler functions for the given events this component handles. */
    private handlers = {
        moveUp: () => this.move("up"),
        moveDown: () => this.move("down"),
        moveBack: this.goBack,
        toggleShowHidden: this.toggleShowHidden,
        newFile: () => this.inputNewItem("file"),
        newFolder: () => this.inputNewItem("folder"),
        rename: this.inputRenameItem
    }

    /** Finds directory items using simple text matching. */
    private directoryTextFinder: DirectoryTextFinder;

    /** Stores navigation data in a simple stack structure. */
    private navigationStack: INavigationNode[];

    /**
     * Instantiates the DirectoryPane component.
     *
     * @param props - the properties for the DirectoryPane component
     */
    public constructor(props: IDirectoryPaneProps, context: IAppContext) {
        super(props, context);

        this.state = {
            path: os.homedir(),
            directoryItems: [],
            selectedItem: 0,
            showHiddenItems: false,
            creatingNewItem: false,
            renamingItem: false,
            itemDeleted: false
        };

        this.directoryTextFinder = new DirectoryTextFinder();
        this.navigationStack = [];
    }

    /**
     * Updates the directory contents after loading the component.
     */
    public async componentDidMount() {
        const items = await DirectoryManager.listDirectory(this.state.path);

        this.setState({ directoryItems: items } as IDirectoryPaneState);
    }

    /**
     * Updates the directory contents after updating the component.
     *
     * @param prevProps - the previous props object
     * @param prevState - the previous state object
     */
    public async componentDidUpdate(prevProps: {}, prevState: IDirectoryPaneState) {
        if (prevState.path === this.state.path &&
            !prevState.creatingNewItem &&
            !prevState.renamingItem &&
            !this.state.itemDeleted) {

            return;
        }

        if (prevState.itemDeleted) {
            this.setState({ itemDeleted: false } as IDirectoryPaneState);
        }

        if (this.navigationStack.length > 0 &&
            this.navigationStack[this.navigationStack.length - 1].path === this.state.path) {

            this.setState(
                {
                    directoryItems: this.navigationStack.pop()!.directoryItems
                } as IDirectoryPaneState);
        } else {
            this.setState(
                {
                    directoryItems: await DirectoryManager.listDirectory(this.state.path)
                } as IDirectoryPaneState);
        }
    }

    /**
     * Defines how the directory pane component is rendered.
     *
     * @returns - a JSX element representing the directory view
     */
    public render(): JSX.Element {
        const items = this.nonHiddenDirectoryItems
            .map((item, i) => {
                const isSelectedItem = this.props.isSelectedPane && !this.state.creatingNewItem && this.state.selectedItem === i;

                if (this.state.renamingItem && isSelectedItem) {
                    const thisItem = this.nonHiddenDirectoryItems.find(i => i.name === item.name);
                    const otherItems = this.state.directoryItems.filter(i => i.name !== item.name);
                    return <InputItem
                        thisItem={thisItem}
                        otherItems={otherItems}
                        sendUpRenameItem={this.renameItem} />;
                } else {
                    return <DirectoryItem
                        key={item.path}
                        model={item}
                        isSelected={isSelectedItem}
                        sendPathUp={this.goIn}
                        sendSelectedItemUp={this.selectItem}
                        sendDeletionUp={this.refreshAfterDelete} />;
                }
            });

        return <ScrollArea
            className="DirectoryPane"
            horizontal={false}
            style={{ backgroundColor: this.context.theme.primaryBackgroundColour }}
            verticalContainerStyle={{ width: "20px" }}
            verticalScrollbarStyle={{ width: "100%" }}>
            <HotKeys handlers={this.handlers}
                ref={component => component && items.length === 0 && this.autoFocus(component)}>
                <PathPanel path={this.state.path} />
                <ul onKeyDown={this.handleKeyDown}>
                    {items}
                    {this.state.creatingNewItem &&
                        <InputItem
                            creatingItemType={this.state.creatingNewItem}
                            sendUpCreateItem={this.createNewItem}
                            otherItems={this.state.directoryItems} />}
                </ul>
            </HotKeys>
        </ScrollArea>;
    }

    /**
     * Updates the path held in the directory pane's state
     *
     * @param path - the path to update to
     */
    @autobind
    private goIn(path: string) {
        const navigationNode: INavigationNode = {
            path: this.state.path,
            selectedItem: this.state.selectedItem,
            directoryItems: this.state.directoryItems
        }
        this.navigationStack.push(navigationNode);
        this.setState({ path: path, selectedItem: 0 } as IDirectoryPaneState);
    }

    /**
     * Navigates back to the parent directory.
     */
    @autobind
    private goBack() {
        const parentDirectory = path.join(this.state.path, "..");
        this.setState({ path: parentDirectory, selectedItem: 0 } as IDirectoryPaneState);
    }

    /**
     * Navigates the currently-selected item in the given direction.
     *
     * @param direction - the direction to navigate in
     */
    @autobind
    private move(direction: DirectoryDirection) {
        if (direction === "up") {
            if (this.state.selectedItem > 0) {
                this.setState(prevState => ({ selectedItem: prevState.selectedItem - 1 } as IDirectoryPaneState));
            }
        } else {
            if (this.state.selectedItem < this.nonHiddenDirectoryItems.length - 1) {
                this.setState(prevState => ({ selectedItem: prevState.selectedItem + 1 } as IDirectoryPaneState));
            }
        }
    }

    /**
     * Handles toggling whether hidden files should be shown.
     */
    @autobind
    private toggleShowHidden() {
        this.setState(prevState => (
            {
                showHiddenItems: !prevState.showHiddenItems
            } as IDirectoryPaneState));
    }

    /**
     * Handles selecting the given item in the directory pane.
     *
     * @param itemToSelect - the item to select
     */
    @autobind
    private selectItem(itemToSelect: IDirectoryItem) {
        const index = this.nonHiddenDirectoryItems
            .findIndex(item => item.name === itemToSelect.name);
        this.setState({ selectedItem: index } as IDirectoryPaneState);
        this.props.sendSelectedPaneUp(this.props.id);
    }

    /**
     * Begins the creation of a new directory item.
     *
     * @param itemTypeToCreate - the type of the item to begin creating
     */
    @autobind
    private inputNewItem(itemTypeToCreate: ItemType) {
        this.setState({ creatingNewItem: itemTypeToCreate } as IDirectoryPaneState);
    }

    /**
     * Creates a new directory item if arguments are provided.
     *
     * @param itemName - the name of the item to be created
     * @param itemTypeToCreate - the type of the item to be created
     */
    @autobind
    private createNewItem(itemName?: string, itemTypeToCreate?: ItemType) {
        if (itemName && itemTypeToCreate) {
            DirectoryManager.createItem(itemName, this.state.path, itemTypeToCreate);
        }

        this.setState({ creatingNewItem: false } as IDirectoryPaneState);
    }

    /**
     * Begins the renaming of a directory item.
     */
    @autobind
    private inputRenameItem() {
        this.setState({ renamingItem: true } as IDirectoryPaneState);
    }

    /**
     * Renames a directory item if arguments are provided.
     *
     * @param oldName - the previous name
     * @param newName - the new name
     */
    @autobind
    private renameItem(oldName?: string, newName?: string) {
        if (oldName && newName) {
            DirectoryManager.renameItem(oldName, newName, this.state.path);
        }

        this.setState({ renamingItem: false } as IDirectoryPaneState);
    }

    /**
     * Handles refreshing the page after a delete.
     */
    @autobind
    private refreshAfterDelete() {
        this.setState({ itemDeleted: true } as IDirectoryPaneState);
    }

    /**
     * Handles adding single alphanumeric characters to a search term to update
     * the currently-selected item.
     *
     * @param event - an event raised on key down
     */
    @autobind
    private handleKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
        const regex = new RegExp(/[a-z0-9]/, "i");
        if (event.key.length === 1 && regex.test(event.key)) {
            const indexToSelect = this.directoryTextFinder.addCharAndSearch(
                event.key, this.nonHiddenDirectoryItems);

            if (indexToSelect >= 0) {
                this.setState({ selectedItem: indexToSelect } as IDirectoryPaneState);
            }
        }
    }

    /**
     * Gets the directory items that are not currently hidden.
     */
    private get nonHiddenDirectoryItems(): IDirectoryItem[] {
        return this.state.directoryItems.filter(
            item => !item.isHidden || this.state.showHiddenItems);
    }

    /**
     * Handles focusing the directory pane if there are no items to display.
     *
     * @param component - the HotKeys wrapper component to call focus on
     */
    private autoFocus(component: HotKeys) {
        (ReactDOM.findDOMNode(component) as HTMLElement).focus();
    }
}

export default DirectoryPane;